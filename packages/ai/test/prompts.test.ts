import { readPromptSources } from '../src/prompt-source';
import { promptSources } from '../src/prompts.generated';
import { systemPrompt } from '../src/prompts';

describe('prompts', () => {
  it('the embedded prompts match agents/**/prompt.md (run `pnpm --filter @cmobeat/ai prompts`)', () => {
    expect(promptSources).toEqual(readPromptSources());
  });

  it('builds each step from its own section plus the shared voice rules', () => {
    const classify = systemPrompt('moves-tracker.classify').text;
    expect(classify).toContain('## Classify');
    expect(classify).not.toContain('## Draft');
    expect(classify).toContain('sources or silence');
    expect(classify).toContain('## Voice');
    expect(systemPrompt('moves-tracker.draft').text).toContain('## Draft');
    expect(systemPrompt('listing-parser').text).toContain('Comp is required on every listing');
  });

  it('versions prompts by content', () => {
    expect(systemPrompt('listing-parser').version).toMatch(/^listing-parser@[0-9a-f]{12}$/);
    expect(systemPrompt('moves-tracker.classify').version).not.toBe(
      systemPrompt('moves-tracker.draft').version,
    );
  });
});
