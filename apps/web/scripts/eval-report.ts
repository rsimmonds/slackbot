/**
 * Writes agents/eval-report.json from the offline eval run, for the staff console
 * (/console/agents). Offline and deterministic: no network, no API key.
 *
 *   pnpm --filter @cmobeat/web evals:report
 *
 * Imports the eval runner by path: it is a dev tool of @cmobeat/ai, not part of its public API.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runSuite, suites } from '../../../packages/ai/src/evals/runner';

async function main() {
  const results = [];
  for (const def of suites) {
    const r = await runSuite(def);
    results.push({
      suite: r.suite,
      step: r.step,
      total: r.total,
      model: r.model,
      fallback: r.fallback,
      failures: r.failures.map((f) => ({ id: f.id, mode: f.mode, problems: f.problems })),
    });
  }
  const out = fileURLToPath(new URL('../../../agents/eval-report.json', import.meta.url));
  writeFileSync(
    out,
    `${JSON.stringify({ generatedAt: new Date().toISOString(), mode: 'offline', results }, null, 2)}\n`,
  );
  console.log(`Wrote ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
