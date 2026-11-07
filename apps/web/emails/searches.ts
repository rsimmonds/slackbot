import type { SearchPlan } from '@cmobeat/config';
import { searchFeeTerms } from '@cmobeat/config';
import { button, esc, layout, type RenderedEmail } from './layout';

const p = (s: string) => `<p style="font-size:16px;line-height:1.6;margin:0 0 12px">${esc(s)}</p>`;
const muted = (s: string) =>
  `<p style="font-size:14px;line-height:1.6;color:#5A6068;margin:0 0 12px">${esc(s)}</p>`;

/** To talent partners: a new paid search is waiting to be taken. No candidate data. */
export function searchRequestedEmail(opts: {
  title: string;
  plan: SearchPlan;
  url: string;
}): RenderedEmail {
  const label = searchFeeTerms[opts.plan].label;
  const subject = `New ${label.toLowerCase()}: ${opts.title}`;
  const { html, text } = layout({
    preheader: 'An employer has requested a search.',
    heading: 'A search is waiting.',
    bodyHtml: `${p(`${label} for “${opts.title}”. The employer accepted the fee terms.`)}${button(opts.url, 'Open the search')}`,
    bodyText: `${label} for "${opts.title}". The employer accepted the fee terms.\n\n${opts.url}`,
  });
  return { subject, html, text };
}

/** To the employer: their search moved. */
export function searchUpdateEmail(opts: {
  title: string;
  update: string;
  url: string;
}): RenderedEmail {
  const subject = `Search update: ${opts.title}`;
  const { html, text } = layout({
    preheader: opts.update,
    heading: 'Your search moved.',
    bodyHtml: `${p(opts.update)}${button(opts.url, 'See the search')}`,
    bodyText: `${opts.update}\n\n${opts.url}`,
  });
  return { subject, html, text };
}

export function invoiceIssuedEmail(opts: {
  title: string;
  description: string;
  amount: string;
  dueDays: number;
  url: string;
}): RenderedEmail {
  const subject = `Invoice: ${opts.amount} for ${opts.title}`;
  const { html, text } = layout({
    preheader: `Due in ${opts.dueDays} days.`,
    heading: 'Your invoice.',
    bodyHtml: `${p(opts.description)}${p(`Amount due: ${opts.amount}, within ${opts.dueDays} days.`)}${button(opts.url, 'View invoice')}`,
    bodyText: `${opts.description}\nAmount due: ${opts.amount}, within ${opts.dueDays} days.\n\n${opts.url}`,
  });
  return { subject, html, text };
}

export function invoiceReceiptEmail(opts: {
  amount: string;
  reference: string;
  url: string;
}): RenderedEmail {
  const subject = `Receipt: ${opts.amount} received`;
  const { html, text } = layout({
    preheader: 'Payment received. Thank you.',
    heading: 'Payment received.',
    bodyHtml: `${p(`We received ${opts.amount}.`)}${muted(`Reference ${opts.reference}.`)}${button(opts.url, 'Billing')}`,
    bodyText: `We received ${opts.amount}.\nReference ${opts.reference}.\n\n${opts.url}`,
  });
  return { subject, html, text };
}
