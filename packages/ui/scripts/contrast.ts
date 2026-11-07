/**
 * WCAG 2.2 AA contrast check for every text and interactive token pair, in both themes.
 * Parses src/styles/tokens.css so the CSS stays the single source of truth. Exits 1 on failure.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkContrast } from '../src/lib/contrast';

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), '../src/styles/tokens.css'),
  'utf8',
);
const results = checkContrast(css);
const failures = results.filter((r) => !r.pass);

for (const r of results) {
  const mark = r.pass ? 'pass' : 'FAIL';
  console.log(
    `${mark}  ${r.theme.padEnd(7)} ${r.fg.padEnd(22)} on ${r.bg.padEnd(16)} ${r.ratio.toFixed(2)} (min ${r.min})`,
  );
}
console.log(`\n${results.length - failures.length}/${results.length} pairs pass WCAG 2.2 AA.`);
if (failures.length) process.exit(1);
