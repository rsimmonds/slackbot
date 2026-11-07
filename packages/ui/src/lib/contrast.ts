/** WCAG relative-luminance contrast, used by the CI contrast check and its unit test. */

export function parseThemes(css: string): Record<'retreat' | 'lab', Record<string, string>> {
  const block = (selector: RegExp) => {
    const m = css.match(selector);
    if (!m?.[1]) throw new Error(`Theme block not found: ${selector}`);
    const vars: Record<string, string> = {};
    for (const [, k, v] of m[1].matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) vars[k!] = v!.trim();
    return vars;
  };
  return {
    retreat: block(/\[data-theme='retreat'\]\s*\{([^}]*)\}/),
    lab: block(/\[data-theme='lab'\]\s*\{([^}]*)\}/),
  };
}

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) throw new Error(`Not a 6-digit hex colour: ${hex}`);
  const [r, g, b] = [0, 2, 4].map((i) => channel(parseInt(h.slice(i, i + 2), 16)));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function ratio(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const backgrounds = ['bg', 'surface', 'surface-raised'];
/** Body-size text: 4.5:1. */
const textTokens = [
  'text',
  'text-2',
  'text-3',
  'synapse-ink',
  'filament-ink',
  'signal-good-ink',
  'signal-critical-ink',
];
/** Non-text UI (rings, focus outline, seals, borders of controls): 3:1. */
const graphicTokens = ['synapse', 'filament', 'signal-good', 'signal-critical'];
/** Filled buttons: label on fill. */
const fills: [string, string][] = [
  ['on-filament', 'filament-ink'],
  ['on-synapse', 'synapse-ink'],
  ['bg', 'text'], // primary button: bg-coloured label on text-coloured fill
];

export interface ContrastResult {
  theme: string;
  fg: string;
  bg: string;
  ratio: number;
  min: number;
  pass: boolean;
}

export function checkContrast(css: string): ContrastResult[] {
  const out: ContrastResult[] = [];
  for (const [theme, vars] of Object.entries(parseThemes(css))) {
    const get = (k: string) => {
      const v = vars[k];
      if (!v) throw new Error(`${theme}: missing --${k}`);
      return v;
    };
    const push = (fg: string, bg: string, min: number) => {
      const r = ratio(get(fg), get(bg));
      out.push({ theme, fg, bg, ratio: r, min, pass: r >= min });
    };
    for (const bg of backgrounds) {
      for (const fg of textTokens) push(fg, bg, 4.5);
      for (const fg of graphicTokens) push(fg, bg, 3);
    }
    for (const [fg, bg] of fills) push(fg, bg, 4.5);
  }
  return out;
}
