import { appUrl, button, esc, layout, type RenderedEmail } from './layout';

export interface AlertRole {
  id: string;
  title: string;
  company: string;
  comp: string;
  location: string;
}

/** One email per saved search with the new roles since the last alert. */
export function savedSearchAlertEmail(opts: {
  searchName: string;
  summary: string;
  roles: AlertRole[];
  searchUrl: string;
}): RenderedEmail {
  const n = opts.roles.length;
  const subject = `${n} new ${n === 1 ? 'role' : 'roles'} for “${opts.searchName}”`;
  const rows = opts.roles
    .map(
      (r) => `<tr><td style="padding:12px 0;border-top:1px solid rgba(10,12,16,0.08)">
<a href="${esc(`${appUrl()}/jobs/${r.id}`)}" style="color:#0B0D10;font-size:16px">${esc(r.title)}</a>
<div style="color:#5A6068;font-size:14px">${esc(r.company)} · ${esc(r.comp)} · ${esc(r.location)}</div></td></tr>`,
    )
    .join('');
  const { html, text } = layout({
    preheader: subject,
    heading: subject,
    bodyHtml: `<p style="color:#5A6068;font-size:14px;margin:0 0 8px">${esc(opts.summary)}</p><table role="presentation" width="100%">${rows}</table>${button(opts.searchUrl, 'See all matches')}`,
    bodyText: `${opts.summary}\n\n${opts.roles.map((r) => `- ${r.title}, ${r.company} (${r.comp}, ${r.location})\n  ${appUrl()}/jobs/${r.id}`).join('\n')}\n\nSee all matches: ${opts.searchUrl}`,
    footerNote: `Manage alerts: ${appUrl()}/account/searches`,
  });
  return { subject, html, text };
}

export function paymentReceiptEmail(opts: {
  listingTitle: string;
  planLabel: string;
  amount: string;
  reference: string;
}): RenderedEmail {
  const subject = `Receipt: ${opts.planLabel} for “${opts.listingTitle}”`;
  const { html, text } = layout({
    preheader: 'Payment received. Your listing is with our editors for review.',
    heading: 'Payment received.',
    bodyHtml: `<p style="font-size:16px;line-height:1.6">${esc(opts.planLabel)} for <strong>${esc(opts.listingTitle)}</strong>: ${esc(opts.amount)}.</p>
<p style="font-size:14px;color:#5A6068">A person reviews every listing before it goes live, usually within one business day. Reference ${esc(opts.reference)}.</p>
${button(`${appUrl()}/employer/jobs`, 'View your listings')}`,
    bodyText: `${opts.planLabel} for "${opts.listingTitle}": ${opts.amount}.\nA person reviews every listing before it goes live, usually within one business day.\nReference ${opts.reference}.\n\n${appUrl()}/employer/jobs`,
  });
  return { subject, html, text };
}

export function listingDecisionEmail(opts: {
  listingTitle: string;
  approved: boolean;
  note?: string | null;
  listingId: string;
}): RenderedEmail {
  const subject = opts.approved
    ? `Live: “${opts.listingTitle}”`
    : `Changes needed: “${opts.listingTitle}”`;
  const href = opts.approved
    ? `${appUrl()}/jobs/${opts.listingId}`
    : `${appUrl()}/employer/jobs/${opts.listingId}/edit`;
  const { html, text } = layout({
    preheader: subject,
    heading: opts.approved ? 'Your listing is live.' : 'Your listing needs changes.',
    bodyHtml: `${opts.note ? `<p style="font-size:16px;line-height:1.6">${esc(opts.note)}</p>` : ''}${button(href, opts.approved ? 'View listing' : 'Edit and resubmit')}`,
    bodyText: `${opts.note ? `${opts.note}\n\n` : ''}${href}`,
  });
  return { subject, html, text };
}

export function renewalReminderEmail(opts: {
  listingTitle: string;
  expiresOn: string;
  listingId: string;
}): RenderedEmail {
  const subject = `“${opts.listingTitle}” closes on ${opts.expiresOn}`;
  const { html, text } = layout({
    preheader: subject,
    heading: 'Your listing closes in 7 days.',
    bodyHtml: `<p style="font-size:16px;line-height:1.6"><strong>${esc(opts.listingTitle)}</strong> closes on ${esc(opts.expiresOn)}. Renew it to keep it on the board for another 60 days.</p>${button(`${appUrl()}/employer/jobs`, 'Renew listing')}`,
    bodyText: `"${opts.listingTitle}" closes on ${opts.expiresOn}. Renew it to keep it on the board for another 60 days.\n${appUrl()}/employer/jobs`,
  });
  return { subject, html, text };
}
