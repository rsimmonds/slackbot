import { brand } from '@cmobeat/config';

/**
 * Minimal transactional layout for the jobs workstream's emails. Plain, inline-styled, light
 * theme. To be replaced by the shared React Email layout from @cmobeat/email.
 */
export const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export { esc };

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function layout(opts: {
  preheader: string;
  heading: string;
  bodyHtml: string;
  bodyText: string;
  footerNote?: string;
}): { html: string; text: string } {
  const footer = `${brand.name} · ${opts.footerNote ?? 'You receive this because of activity on your account.'}`;
  const html = `<!doctype html><html><body style="margin:0;background:#F4F5F6;font-family:Geist,Helvetica,Arial,sans-serif;color:#0B0D10">
<span style="display:none">${esc(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border:1px solid rgba(10,12,16,0.08);border-radius:8px">
<tr><td style="padding:32px">
<div style="font-family:'Geist Mono',Menlo,monospace;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#6B6F74">${esc(brand.name)}</div>
<h1 style="font-family:'Instrument Serif',Georgia,serif;font-weight:400;font-size:28px;line-height:1.2;margin:16px 0 20px">${esc(opts.heading)}</h1>
${opts.bodyHtml}
</td></tr></table>
<p style="font-size:12px;color:#6B6F74;margin:16px 0 0">${esc(footer)}</p>
</td></tr></table></body></html>`;
  const text = `${opts.heading}\n\n${opts.bodyText}\n\n—\n${footer}\n`;
  return { html, text };
}

export const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#0B0D10;color:#FFFFFF;text-decoration:none;padding:10px 16px;border-radius:4px;font-size:14px">${esc(label)}</a></p>`;
