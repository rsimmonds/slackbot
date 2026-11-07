import { serialize } from 'next-mdx-remote/serialize';

import { allowedComponents } from './snippets';

export { allowedComponents, componentSnippets } from './snippets';

export type MdxCheck = { ok: true } | { ok: false; error: string };

/**
 * Compiles MDX the same way the renderer does (JavaScript blocked) and rejects components the
 * renderer doesn't provide. Run before submit and publish so a broken article never goes live.
 */
export async function checkMdx(source: string): Promise<MdxCheck> {
  const unknown = findUnknownComponents(source);
  if (unknown.length) {
    return {
      ok: false,
      error: `Unknown component${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Use ${allowedComponents.join(', ')}.`,
    };
  }
  try {
    await serialize(source, {
      blockJS: true,
      blockDangerousJS: true,
      mdxOptions: { format: 'mdx' },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg.split('\n').slice(0, 3).join(' ').trim() || 'The body does not compile.',
    };
  }
}

export function findUnknownComponents(source: string): string[] {
  const withoutCode = source.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const names = new Set<string>();
  for (const m of withoutCode.matchAll(/<\/?([A-Z][A-Za-z0-9]*)/g)) names.add(m[1]!);
  return [...names].filter((n) => !(allowedComponents as readonly string[]).includes(n)).sort();
}
