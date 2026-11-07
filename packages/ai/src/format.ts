import { z } from 'zod';

/**
 * How untrusted input reaches a model: inside a named tag, so the prompt can tell the model that
 * everything in the tag is data. Closing tags inside the data are neutralised.
 */
export function tagged(tag: string, body: string): string {
  const safe = body.replaceAll(`</${tag}>`, `</ ${tag}>`);
  return `<${tag}>\n${safe}\n</${tag}>`;
}

export function readTagged(user: string, tag: string): string {
  const m = user.match(new RegExp(`<${tag}>\\n([\\s\\S]*)\\n</${tag}>`));
  return m?.[1] ?? '';
}

export const SourceItemPayload = z.object({
  kind: z.enum(['newsroom', 'wire', 'edgar', 'submission']),
  url: z.string().url(),
  title: z.string(),
  publisher: z.string().nullable(),
  publishedAt: z.string().nullable(),
  text: z.string(),
});
export type SourceItemPayload = z.infer<typeof SourceItemPayload>;

export const sourceItemMessage = (item: SourceItemPayload) =>
  tagged('source_item', JSON.stringify(item, null, 2));

export const readSourceItem = (user: string): SourceItemPayload =>
  SourceItemPayload.parse(JSON.parse(readTagged(user, 'source_item')));
