/**
 * Embeds agents/<name>/prompt.md and agents/_shared/voice.md into src/prompts.generated.ts so the
 * prompts ship inside the server bundle (no filesystem reads at runtime, works on Vercel).
 * Run: pnpm --filter @cmobeat/ai prompts. A unit test fails if the generated file is stale.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderGenerated } from '../src/prompt-source';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '../src/prompts.generated.ts');
writeFileSync(out, renderGenerated());
console.log(`Wrote ${out}`);
