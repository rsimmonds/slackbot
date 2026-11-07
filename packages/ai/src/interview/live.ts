import Anthropic from '@anthropic-ai/sdk';
import { adminDb, agentRuns } from '@cmobeat/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { agentModels, costMicros, models, pricing, type ModelId } from '../models';
import { systemPrompt } from '../prompts';
import { runAgent } from '../run-agent';
import type { AnySpec, AnyState, Driver } from './engine';
import { extractOffline, fieldOf, questionText } from './offline';

/**
 * Claude-backed interview driver (AI_PROVIDER=anthropic).
 * absorb: one structured call (Zod-validated via runAgent: retry once, then human queue) returning
 *         a draft patch. If it fails, the offline extractor keeps the session moving.
 * ask:    one streamed call that phrases the next question; tokens drive the Iris and Resolve.
 */

const escape = (s: string) => s.replace(/</g, '&lt;');

/** The conversation so far, with the person's words marked as data. */
export function transcriptFor(state: AnyState, maxTurns = 30): string {
  return state.turns
    .slice(-maxTurns)
    .map((t) =>
      t.role === 'assistant'
        ? `<question field="${t.field ?? ''}">${escape(t.text)}</question>`
        : `<answer>${escape(t.text)}</answer>`,
    )
    .join('\n');
}

/** Every top-level output field nullable (structured outputs need explicit keys; null = not learned). */
export function patchSchema(spec: AnySpec) {
  const schema = spec.schema as unknown as z.ZodObject<z.ZodRawShape>;
  const shape = Object.fromEntries(
    Object.entries(schema.shape).map(([k, v]) => [k, (v as z.ZodType).nullable()]),
  );
  return z.object({
    patch: z.object(shape),
    vague: z.boolean().describe('True if the answer gave too little to use for the target field'),
  });
}

function absorbMessage(spec: AnySpec, state: AnyState, field: string, answer: string) {
  const f = fieldOf(spec, field);
  return [
    `<target_field key="${field}">${escape(f.question)}</target_field>`,
    `<draft>${escape(JSON.stringify(state.draft))}</draft>`,
    `<transcript>\n${transcriptFor(state)}\n</transcript>`,
    `<latest_answer>${escape(answer)}</latest_answer>`,
    'Return a patch with only what the latest answer states. Use null for every key it does not cover.',
  ].join('\n\n');
}

function askMessage(spec: AnySpec, state: AnyState, field: string, followUp: boolean) {
  const f = fieldOf(spec, field);
  return [
    `<next_field key="${field}" follow_up="${followUp}">${escape(followUp ? f.followUp : f.question)}</next_field>`,
    `<missing>${state.remaining.join(', ')}</missing>`,
    `<transcript>\n${transcriptFor(state)}\n</transcript>`,
    `Question ${state.questionIndex + 1} of ${spec.maxQuestions}. Write only the next question.`,
  ].join('\n\n');
}

let client: Anthropic | undefined;
const anthropic = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }));

export const liveDriver: Driver = {
  async absorb(spec, state, field, answer) {
    const schema = patchSchema(spec);
    const res = await runAgent({
      step: spec.agent,
      promptSection: 'Extract',
      user: absorbMessage(spec, state, field, answer),
      schema,
      effort: 'medium',
      maxTokens: 8000,
    });
    if (!res.ok) return extractOffline(spec, state, field, answer);
    const out = res.output as z.infer<typeof schema>;
    const patch = Object.fromEntries(Object.entries(out.patch).filter(([, v]) => v !== null));
    return {
      patch,
      vague: out.vague && !fieldOf(spec, field).isComplete({ ...state.draft, ...patch }),
    };
  },

  async *ask(spec, state, field, followUp) {
    const model = agentModels[spec.agent] as ModelId;
    const prompt = systemPrompt(spec.agent, 'Ask');
    const db = adminDb();
    const [run] = await db
      .insert(agentRuns)
      .values({
        agent: `${spec.agent}.ask`,
        model,
        promptVersion: prompt.version,
        status: 'running',
      })
      .returning({ id: agentRuns.id });
    const started = Date.now();
    let emitted = false;
    try {
      const stream = anthropic().beta.messages.stream({
        model,
        max_tokens: 4000,
        system: [{ type: 'text', text: prompt.text, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: askMessage(spec, state, field, followUp) }],
        // Phrasing one question needs little reasoning; keep it quick.
        output_config: { effort: 'low' },
        ...(model === models.opus || model === models.sonnet
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          emitted = true;
          yield event.delta.text;
        }
      }
      const final = await stream.finalMessage();
      const served = final.model in pricing ? (final.model as ModelId) : model;
      await db
        .update(agentRuns)
        .set({
          model: final.model,
          status: final.stop_reason === 'refusal' ? 'failed' : 'succeeded',
          tokensIn: final.usage.input_tokens + (final.usage.cache_read_input_tokens ?? 0),
          tokensOut: final.usage.output_tokens,
          costMicros: costMicros(served, {
            input: final.usage.input_tokens + (final.usage.cache_creation_input_tokens ?? 0) * 1.25,
            output: final.usage.output_tokens,
            cacheRead: final.usage.cache_read_input_tokens ?? 0,
          }),
          latencyMs: Date.now() - started,
        })
        .where(eq(agentRuns.id, run!.id));
      if (!emitted || final.stop_reason === 'refusal') yield questionText(spec, field, followUp);
    } catch (error) {
      await db
        .update(agentRuns)
        .set({ status: 'failed', latencyMs: Date.now() - started })
        .where(eq(agentRuns.id, run!.id));
      // Keep the session moving with the spec's own wording if nothing was streamed yet.
      if (!emitted) yield questionText(spec, field, followUp);
      else if (!(error instanceof Anthropic.APIError)) throw error;
    }
  },
};
