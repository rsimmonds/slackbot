import { createHash } from 'node:crypto';
import type { AgentStep } from './models';
import { promptSources } from './prompts.generated';

/** Which prompt file and which `## Section` each step uses (null = the whole file). */
const stepSource: Record<AgentStep, { file: string; section: string | null } | null> = {
  'listing-parser': { file: 'listing-parser', section: null },
  'moves-tracker.classify': { file: 'moves-tracker', section: 'Classify' },
  'moves-tracker.draft': { file: 'moves-tracker', section: 'Draft' },
  'mandate-builder': { file: 'mandate-builder', section: null },
  'profile-interviewer': { file: 'profile-interviewer', section: null },
  matcher: { file: 'matcher', section: null },
  'editorial-assistant': null,
};

/** Splits a prompt file into its preamble (before the first ##) and named ## sections. */
export function splitSections(md: string): { preamble: string; sections: Record<string, string> } {
  const parts = md.split(/^## /m);
  const sections: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const [heading, ...rest] = part.split('\n');
    sections[heading!.trim()] = `## ${heading!.trim()}\n${rest.join('\n')}`.trim();
  }
  return { preamble: parts[0]!.trim(), sections };
}

export interface SystemPrompt {
  text: string;
  /** Short content hash. Recorded on every agent run so outputs can be traced to a prompt. */
  version: string;
}

const cache = new Map<string, SystemPrompt>();

/**
 * The system prompt for a step. `sectionOverride` picks a `## Section` of the step's prompt file
 * (interviews use "Extract" and "Ask"); the preamble is always included.
 */
export function systemPrompt(step: AgentStep, sectionOverride?: string): SystemPrompt {
  const key = `${step}#${sectionOverride ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const base = stepSource[step];
  const src = base && sectionOverride ? { ...base, section: sectionOverride } : base;
  if (!src) throw new Error(`No prompt file for ${step} yet`);
  const md = promptSources[src.file];
  if (!md) throw new Error(`Prompt file missing: agents/${src.file}/prompt.md`);
  let body = md.trim();
  if (src.section) {
    const { preamble, sections } = splitSections(md);
    const section = sections[src.section];
    if (!section)
      throw new Error(`Section "${src.section}" missing in agents/${src.file}/prompt.md`);
    body = `${preamble}\n\n${section}`;
  }
  const text = `${body}\n\n${promptSources.voice!.trim()}`;
  const version = `${src.file}@${createHash('sha256').update(text).digest('hex').slice(0, 12)}`;
  const prompt = { text, version };
  cache.set(key, prompt);
  return prompt;
}
