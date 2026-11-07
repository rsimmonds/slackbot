import { adminDb, agentRuns, humanQueue } from '@cmobeat/db';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  FakeProvider,
  requestKey,
  type CompletionResponse,
  type LlmProvider,
} from '../src/provider';
import { systemPrompt } from '../src/prompts';
import { runAgent } from '../src/run-agent';
import { MoveClassificationSchema } from '../src/schemas/move';

const valid = { relevant: true, moveType: 'appointed', confidence: 0.9, reason: 'Named CMO.' };
const usage = { input: 1200, output: 80, cacheRead: 3000, cacheWrite: 0 };

/** A scripted provider: returns the queued responses in order. */
function scripted(...responses: Partial<CompletionResponse>[]): LlmProvider & { calls: number } {
  const p = {
    name: 'anthropic' as const,
    calls: 0,
    async complete() {
      const r = responses[Math.min(p.calls, responses.length - 1)]!;
      p.calls++;
      if ('output' in r && r.output instanceof Error) throw r.output;
      return {
        output: undefined,
        usage,
        servedModel: 'claude-haiku-5-5',
        ...r,
      } as CompletionResponse;
    },
  };
  return p;
}

const run = (provider: LlmProvider, user = `case ${Math.random()}`) =>
  runAgent({ step: 'moves-tracker.classify', user, schema: MoveClassificationSchema, provider });

describe('runAgent', () => {
  it('returns validated output and logs one run with tokens, cost and prompt version', async () => {
    const provider = scripted({ output: valid });
    const res = await run(provider);
    expect(res.ok).toBe(true);
    const [row] = await adminDb().select().from(agentRuns).where(eq(agentRuns.id, res.runId));
    expect(row).toMatchObject({
      agent: 'moves-tracker.classify',
      model: 'claude-haiku-5-5',
      status: 'succeeded',
      tokensIn: 4200,
      tokensOut: 80,
      promptVersion: systemPrompt('moves-tracker.classify').version,
    });
    // Haiku 5.5: $0.10/M in, $0.50/M out, $0.01/M cache read → 120 + 40 + 30 micro-dollars.
    expect(row!.costMicros).toBe(190);
    expect(row!.inputRef).toMatch(/^sha256:[0-9a-f]{32}$/);
    expect(row!.outputRef).toMatch(/^sha256:/);
  });

  it('retries once on invalid output, then succeeds', async () => {
    const provider = scripted({ output: { relevant: 'yes' } }, { output: valid });
    const res = await run(provider);
    expect(res.ok).toBe(true);
    expect(provider.calls).toBe(2);
    const rows = await adminDb()
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agent, 'moves-tracker.classify'));
    expect(rows.some((r) => r.status === 'failed')).toBe(true);
  });

  it('sends the input to the human queue after two invalid outputs', async () => {
    const provider = scripted({ invalidReason: 'refusal (cyber)' }, { output: { confidence: 7 } });
    const res = await run(provider);
    expect(res).toMatchObject({ ok: false, queued: true });
    expect(provider.calls).toBe(2);
    const [run2] = await adminDb().select().from(agentRuns).where(eq(agentRuns.id, res.runId));
    expect(run2!.status).toBe('queued_for_human');
    const [q] = await adminDb()
      .select()
      .from(humanQueue)
      .where(eq(humanQueue.agentRunId, res.runId));
    expect(q!.reason).toMatch(/^moves-tracker\.classify: schema/);
  });

  it('marks the run failed and rethrows on an API error (the job retries it)', async () => {
    const provider = scripted({ output: new Error('529 overloaded') as unknown as undefined });
    await expect(run(provider, 'api error case')).rejects.toThrow('529');
    const rows = await adminDb().select().from(agentRuns).where(eq(agentRuns.status, 'failed'));
    expect(rows.length).toBeGreaterThan(0);
  });

  it('records zero cost for the offline provider', async () => {
    const res = await runAgent({
      step: 'moves-tracker.classify',
      user: 'x',
      schema: MoveClassificationSchema,
      provider: new FakeProvider(new Map([[requestKey('moves-tracker.classify', 'x'), valid]])),
    });
    const [row] = await adminDb().select().from(agentRuns).where(eq(agentRuns.id, res.runId));
    expect(row).toMatchObject({
      model: 'fake/claude-haiku-5-5',
      costMicros: 0,
      status: 'succeeded',
    });
  });
});

describe('FakeProvider', () => {
  const req = {
    step: 'listing-parser' as const,
    model: 'claude-haiku-5-5' as const,
    system: 's',
    user: 'u',
    schema: z.any(),
    effort: 'low' as const,
    maxTokens: 10,
  };

  it('replays recorded outputs by request key and is deterministic', async () => {
    const p = new FakeProvider(new Map([[requestKey('listing-parser', 'u'), { a: 1 }]]), {
      'listing-parser': () => ({ b: 2 }),
    });
    expect((await p.complete(req)).output).toEqual({ a: 1 });
    expect((await p.complete(req)).output).toEqual((await p.complete(req)).output);
    expect((await p.complete({ ...req, user: 'other' })).output).toEqual({ b: 2 });
  });

  it('reports invalid output when it has nothing for a step', async () => {
    expect((await new FakeProvider().complete(req)).invalidReason).toMatch(/no fake output/);
  });
});
