import { SourceItemPayload } from '../src/format';
import { loadSuite, runSuite, suites } from '../src/evals/runner';

describe('agent evals (offline, runs in CI)', () => {
  it('has at least 20 cases per agent', () => {
    expect(loadSuite('listing-parser/evals/cases.json').cases.length).toBeGreaterThanOrEqual(20);
    const moves =
      loadSuite('moves-tracker/evals/classify.json').cases.length +
      loadSuite('moves-tracker/evals/draft.json').cases.length;
    expect(moves).toBeGreaterThanOrEqual(20);
    expect(loadSuite('moves-tracker/evals/classify.json').cases.length).toBeGreaterThanOrEqual(20);
  });

  it('every case has a unique id and a valid input', () => {
    for (const def of suites) {
      const s = loadSuite(def.file);
      expect(new Set(s.cases.map((c) => c.id)).size).toBe(s.cases.length);
      if (def.step !== 'listing-parser') for (const c of s.cases) SourceItemPayload.parse(c.input);
    }
  });

  it.each(suites.map((s) => [s.step, s] as const))(
    '%s meets its thresholds',
    async (_name, def) => {
      const r = await runSuite(def);
      const fails = r.failures.map((f) => `${f.mode} ${f.id}: ${f.problems.join('; ')}`);
      expect({ fallback: r.fallback.ok, model: r.model.ok, fails }).toMatchObject({
        fallback: true,
        model: true,
      });
    },
  );
});
