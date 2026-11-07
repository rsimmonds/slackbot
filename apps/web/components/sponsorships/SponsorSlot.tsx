import { MonoLabel } from '@cmobeat/ui';
import { activeForPlacement, type Placement } from '@/lib/sponsorships';

/**
 * A sponsorship placement. Renders nothing unless a booking is live today. Clearly labelled,
 * one plain link marked rel="sponsored", no scripts, no pixels, no remote images, and never any
 * reader or candidate data.
 */
export async function SponsorSlot({
  placement,
  className,
}: {
  placement: Exclude<Placement, 'newsletter'>;
  className?: string;
}) {
  const s = await activeForPlacement(placement);
  if (!s) return null;
  const { headline, body, url, logoUrl } = s.creative;
  return (
    <aside
      aria-label={`Sponsored by ${s.sponsorName}`}
      data-sponsorship={placement}
      className={`rounded-panel border border-line bg-surface p-6 ${className ?? ''}`}
    >
      <div className="flex items-center justify-between gap-4">
        <MonoLabel>Sponsored</MonoLabel>
        <MonoLabel className="text-text-3">{s.sponsorName}</MonoLabel>
      </div>
      <div className="mt-4 flex items-start gap-4">
        {logoUrl ? (
          // Self-hosted only (validated on save), so no third-party request is made.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" width={40} height={40} className="size-10 rounded-control" />
        ) : null}
        <div className="flex min-w-0 flex-col gap-2">
          <a
            href={url}
            rel="sponsored noopener noreferrer"
            target="_blank"
            className="text-h4 font-medium text-text underline decoration-line-strong underline-offset-4 hover:decoration-text"
          >
            {headline}
            <span className="sr-only"> (sponsored link, opens in a new tab)</span>
          </a>
          {body ? <p className="text-small text-text-2">{body}</p> : null}
        </div>
      </div>
    </aside>
  );
}
