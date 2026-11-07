import { z } from 'zod';
import { agentModels, type ModelId } from '../models';
import { systemPrompt } from '../prompts';
import { MatchRankingSchema, type MatchRanking } from '../schemas/match';

/**
 * Nightly matching through the Message Batches API (spec 7.1.7): half the cost, results within
 * 24 hours. One request per mandate, keyed by custom_id. Structured output is requested with
 * the ranking's JSON schema and every result is validated again with Zod.
 *
 * The client is injected so this is testable without the network. Untested against the live API
 * in this build.
 */
export interface BatchRequest {
  customId: string;
  user: string;
}

export type BatchOutcome =
  | { ok: true; output: MatchRanking; usage: { input: number; output: number }; model: string }
  | { ok: false; reason: string };

/** The subset of `client.messages.batches` this module uses. */
export interface BatchesClient {
  create(params: { requests: { custom_id: string; params: Record<string, unknown> }[] }): Promise<{
    id: string;
  }>;
  retrieve(id: string): Promise<{ id: string; processing_status: string }>;
  results(id: string): Promise<AsyncIterable<BatchResultLine>>;
}

export interface BatchResultLine {
  custom_id: string;
  result:
    | {
        type: 'succeeded';
        message: {
          model: string;
          stop_reason: string | null;
          content: { type: string; text?: string }[];
          usage: { input_tokens: number; output_tokens: number };
        };
      }
    | { type: 'errored' | 'canceled' | 'expired'; error?: unknown };
}

export function matcherBatchParams(user: string): Record<string, unknown> {
  const model = agentModels.matcher as ModelId;
  const prompt = systemPrompt('matcher');
  return {
    model,
    max_tokens: 16000,
    system: [{ type: 'text', text: prompt.text, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: user }],
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: z.toJSONSchema(MatchRankingSchema) },
    },
  };
}

export async function submitMatcherBatch(
  client: BatchesClient,
  requests: BatchRequest[],
): Promise<string> {
  const batch = await client.create({
    requests: requests.map((r) => ({ custom_id: r.customId, params: matcherBatchParams(r.user) })),
  });
  return batch.id;
}

/** Poll until the batch ends, then collect results keyed by custom_id (results arrive in any order). */
export async function collectMatcherBatch(
  client: BatchesClient,
  batchId: string,
  opts: { pollMs?: number; timeoutMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Map<string, BatchOutcome>> {
  const pollMs = opts.pollMs ?? 60_000;
  const timeoutMs = opts.timeoutMs ?? 24 * 3600_000;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const started = Date.now();
  for (;;) {
    const b = await client.retrieve(batchId);
    if (b.processing_status === 'ended') break;
    if (Date.now() - started > timeoutMs) throw new Error(`Batch ${batchId} did not end in time`);
    await sleep(pollMs);
  }
  return readBatchResults(client, batchId);
}

/** Check once, without waiting: null while the batch is still processing (for durable job steps). */
export async function collectMatcherBatchIfEnded(
  client: BatchesClient,
  batchId: string,
): Promise<Map<string, BatchOutcome> | null> {
  const b = await client.retrieve(batchId);
  return b.processing_status === 'ended' ? readBatchResults(client, batchId) : null;
}

async function readBatchResults(
  client: BatchesClient,
  batchId: string,
): Promise<Map<string, BatchOutcome>> {
  const out = new Map<string, BatchOutcome>();
  for await (const line of await client.results(batchId)) {
    const r = line.result;
    if (r.type !== 'succeeded') {
      out.set(line.custom_id, { ok: false, reason: `batch ${r.type}` });
      continue;
    }
    const m = r.message;
    if (m.stop_reason === 'refusal' || m.stop_reason === 'max_tokens') {
      out.set(line.custom_id, { ok: false, reason: `stop_reason ${m.stop_reason}` });
      continue;
    }
    const text = m.content.find((c) => c.type === 'text')?.text ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      out.set(line.custom_id, { ok: false, reason: 'unparseable output' });
      continue;
    }
    const valid = MatchRankingSchema.safeParse(parsed);
    out.set(
      line.custom_id,
      valid.success
        ? {
            ok: true,
            output: valid.data,
            usage: { input: m.usage.input_tokens, output: m.usage.output_tokens },
            model: m.model,
          }
        : { ok: false, reason: `schema: ${valid.error.issues[0]?.message ?? 'invalid'}` },
    );
  }
  return out;
}
