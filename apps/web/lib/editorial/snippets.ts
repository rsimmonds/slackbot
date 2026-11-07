/* Client-safe: no MDX compiler here. */

/** Components editors may use in article MDX (see lib/mdx/components.tsx). */
export const allowedComponents = ['PullQuote', 'Stat', 'Note'] as const;

/** Snippets shown in the editor so editors don't have to remember the syntax. */
export const componentSnippets: {
  name: (typeof allowedComponents)[number];
  description: string;
  snippet: string;
}[] = [
  {
    name: 'PullQuote',
    description: 'A quote set large in the margin, with an amber rule.',
    snippet: '<PullQuote cite="Name, Title">The line worth quoting.</PullQuote>',
  },
  {
    name: 'Stat',
    description: 'A data card with a big number and a one-line label.',
    snippet: '<Stat value="4.1" unit="yrs" label="Median CMO tenure" footnote="Sample data" />',
  },
  {
    name: 'Note',
    description: 'A quiet aside for methodology or context.',
    snippet: '<Note>How we counted, in one or two sentences.</Note>',
  },
];
