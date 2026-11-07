/**
 * pnpm --filter @cmobeat/ai evals            offline: fallback + recorded outputs, no network
 * EVALS_LIVE=1 pnpm --filter @cmobeat/ai evals  live: calls Claude, records outputs, prints cost
 */
import { AnthropicProvider } from '../provider';
import { interviewSuites, runInterviewSuite } from '../interview/evals';
import { runSuite, suites } from './runner';

const pct = (r: number | null) => (r === null ? '   n/a' : `${(r * 100).toFixed(0).padStart(5)}%`);

async function main() {
  const live = process.env.EVALS_LIVE === '1';
  if (live && !process.env.ANTHROPIC_API_KEY)
    throw new Error('EVALS_LIVE=1 needs ANTHROPIC_API_KEY');
  const provider = live ? new AnthropicProvider() : undefined;
  let ok = true;
  let cost = 0;
  for (const def of suites) {
    const r = await runSuite(def, { live: provider, record: live });
    cost += r.costMicros;
    ok &&= r.model.ok && r.fallback.ok;
    console.log(
      `${r.suite.padEnd(24)} ${String(r.total).padStart(3)} cases | model (${r.model.source}) ${r.model.passed}/${r.model.scored} ${pct(r.model.rate)} min ${r.model.threshold * 100}% | offline fallback ${r.fallback.passed}/${r.fallback.scored} ${pct(r.fallback.rate)} min ${r.fallback.threshold * 100}%`,
    );
    for (const f of r.failures) console.log(`  ✗ [${f.mode}] ${f.id}: ${f.problems.join('; ')}`);
    if (!live && r.model.scored === 0)
      console.log('  (no recorded model outputs yet: run with EVALS_LIVE=1 and a key)');
  }
  for (const def of interviewSuites) {
    const r = runInterviewSuite(def);
    ok &&= r.ok;
    console.log(
      `${r.suite.padEnd(24)} ${String(r.total).padStart(3)} cases | model (live scoring needs a key)      | offline fallback ${r.passed}/${r.total} ${pct(r.rate)} min ${r.threshold * 100}%`,
    );
    for (const f of r.failures) console.log(`  ✗ [fallback] ${f.id}: ${f.problems.join('; ')}`);
  }
  if (live) console.log(`Cost: $${(cost / 1e6).toFixed(4)}`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
