import { createHash } from 'node:crypto';
import { adminDb, agentRuns, humanQueue, type Db } from '@cmobeat/db';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { agentModels, costMicros, pricing, type AgentStep, type ModelId } from './models';
import { systemPrompt } from './prompts';
import type { CompletionResponse, LlmProvider } from './provider';
import { defaultProvider } from './providers';
import type { AgentResult } from './types';

export interface RunAgentOptions<S extends z.ZodType> {
  step: AgentStep;
  /** The user turn. Untrusted input must already be wrapped in tags by the caller. */
  user: string;
  schema: S;
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  /** Who triggered the run (null for scheduled jobs). Not stored with the input. */
  actorId?: string | null;
  provider?: LlmProvider;
  db?: Db;
}

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex').slice(0, 32)}`;

const defaultEffort = (model: ModelId) => (model === 'claude-haiku-5-5' ? 'low' : 'medium');

/**
 * Runs one agent step with structured output (spec 7.1):
 * validate against the Zod schema, retry once on invalid output, then send it to the human queue.
 * Every API call writes an agent_runs row (tokens, cost, latency, prompt version). Inputs are
 * stored as hashes only, so candidate or employer text never lands in the run log.
 */
export async function runAgent<S extends z.ZodType>(
  opts: RunAgentOptions<S>,
): Promise<AgentResult<z.infer<S>>> {
  const db = opts.db ?? adminDb();
  const provider = opts.provider ?? defaultProvider();
  const model = agentModels[opts.step];
  const prompt = systemPrompt(opts.step);
  const inputRef = sha(opts.user);
  let lastReason = 'unknown';
  let lastRunId = '';

  for (let attempt = 1; attempt <= 2; attempt++) {
    const [run] = await db
      .insert(agentRuns)
      .values({
        agent: opts.step,
        model,
        promptVersion: prompt.version,
        inputRef,
        status: 'running',
      })
      .returning({ id: agentRuns.id });
    lastRunId = run!.id;
    const started = Date.now();

    let res: CompletionResponse;
    try {
      res = await provider.complete({
        step: opts.step,
        model,
        system: prompt.text,
        user: opts.user,
        schema: opts.schema,
        effort: opts.effort ?? defaultEffort(model),
        maxTokens: opts.maxTokens ?? 8000,
      });
    } catch (error) {
      await db
        .update(agentRuns)
        .set({ status: 'failed', latencyMs: Date.now() - started })
        .where(eq(agentRuns.id, lastRunId));
      throw error;
    }

    const parsed = res.invalidReason ? null : opts.schema.safeParse(res.output);
    const valid = parsed?.success === true;
    lastReason =
      res.invalidReason ??
      (parsed && !parsed.success
        ? `schema: ${parsed.error.issues[0]?.message ?? 'invalid'}`
        : 'invalid');
    const servedModel = res.servedModel in pricing ? (res.servedModel as ModelId) : null;

    await db
      .update(agentRuns)
      .set({
        model: servedModel ?? (provider.name === 'fake' ? `fake/${model}` : res.servedModel),
        status: valid ? 'succeeded' : attempt === 2 ? 'queued_for_human' : 'failed',
        tokensIn: res.usage.input + res.usage.cacheRead + res.usage.cacheWrite,
        tokensOut: res.usage.output,
        costMicros: servedModel
          ? costMicros(servedModel, {
              input: res.usage.input + res.usage.cacheWrite * 1.25,
              output: res.usage.output,
              cacheRead: res.usage.cacheRead,
            })
          : 0,
        latencyMs: Date.now() - started,
        outputRef: valid ? sha(JSON.stringify(parsed!.data)) : null,
      })
      .where(eq(agentRuns.id, lastRunId));

    if (valid) return { ok: true, output: parsed!.data, runId: lastRunId };
  }

  await db
    .insert(humanQueue)
    .values({ agentRunId: lastRunId, reason: `${opts.step}: ${lastReason}` });
  return { ok: false, reason: lastReason, runId: lastRunId, queued: true };
}
