import { brand } from '@cmobeat/config';
import { DataCard, MeshPanel, MonoLabel, MovesFeed } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArticleCard, articleHref } from '@/components/publication/ArticleCard';
import { NewsletterSignup } from '@/components/publication/NewsletterSignup';
import { RoleCard } from '@/components/publication/RoleCard';
import { SponsorSlot } from '@/components/sponsorships/SponsorSlot';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { consentText } from '@/lib/newsletter/service';
import { formatDate } from '@/lib/publication/labels';
import { listArticles, liveRoles, movesLastDays, recentMoves } from '@/lib/publication/queries';
import { sampleMedianTenure } from '@/lib/publication/sample-tenure';

export const metadata: Metadata = {
  title: { absolute: `${brand.name}: CMO moves, interviews, comp data and senior roles` },
  description: brand.description,
  alternates: { canonical: '/' },
  openGraph: { title: brand.name, description: brand.tagline, type: 'website', url: '/' },
};

export default async function Home() {
  const viewer = await getViewer();
  const { stories, moves, roles, recentCount } = await asViewer(viewer, async (tx) => {
    const [stories, moves, featured, recentCount] = await Promise.all([
      listArticles(tx, { limit: 9 }),
      recentMoves(tx, 8),
      liveRoles(tx, { featuredOnly: true, limit: 3 }),
      movesLastDays(tx, 90),
    ]);
    // Fall back to the newest live roles if fewer than three are featured.
    const roles = featured.length >= 3 ? featured : await liveRoles(tx, { limit: 3 });
    return { stories, moves, roles, recentCount };
  });
  const [lead, ...others] = stories;
  const alsoThisWeek = others.slice(0, 3);
  const more = others.slice(3);

  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <section aria-labelledby="lead-title" className="grid grid-cols-12 gap-8 lg:gap-12">
        <div className="col-span-12 flex flex-col gap-6 lg:col-span-7">
          <MonoLabel>{brand.newsletterName} · Lead story</MonoLabel>
          {lead ? (
            <>
              <h1 id="lead-title" className="font-serif text-h1 text-text md:text-display">
                <Link
                  href={articleHref(lead)}
                  className="decoration-line-strong underline-offset-8 hover:underline"
                >
                  {lead.title}
                </Link>
              </h1>
              {lead.dek ? (
                <p className="max-w-xl text-h4 font-normal text-text-2">{lead.dek}</p>
              ) : null}
              <MonoLabel>
                {formatDate(lead.publishedAt)} · {Math.max(1, Math.round(lead.words / 230))} min
                read
              </MonoLabel>
              {alsoThisWeek.length ? (
                <section aria-labelledby="also-title" className="mt-10 max-w-2xl">
                  <h2 id="also-title" className="label-mono">
                    Also this week
                  </h2>
                  <ul className="mt-3 flex flex-col divide-y divide-line border-y border-line">
                    {alsoThisWeek.map((a) => (
                      <li key={a.id} className="py-4">
                        <Link href={articleHref(a)} className="group flex flex-col gap-1">
                          <span className="font-serif text-h4 text-text group-hover:underline group-hover:underline-offset-4">
                            {a.title}
                          </span>
                          <span className="label-mono">
                            {a.type === 'interview'
                              ? brand.interviewSeries
                              : a.type === 'report'
                                ? 'Report'
                                : 'Story'}{' '}
                            · {formatDate(a.publishedAt, 'short')}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          ) : (
            <h1 id="lead-title" className="font-serif text-h1 text-text md:text-display">
              The first issue is with the editors.
            </h1>
          )}
        </div>
        <aside className="col-span-12 flex flex-col gap-6 lg:col-span-5">
          <MeshPanel>
            <MovesFeed
              precision="day"
              title="CMO Moves"
              moves={moves.map((m) => ({
                id: m.id,
                at: m.effectiveDate,
                type: m.moveType,
                person: m.personName,
                title: m.title,
                company: m.company,
                href: `/moves/${m.id}`,
              }))}
            />
            <Link href="/moves" className="label-mono mt-4 inline-block hover:text-text">
              All moves →
            </Link>
          </MeshPanel>
          <div className="grid grid-cols-2 gap-4">
            <DataCard
              value={sampleMedianTenure.toFixed(1)}
              unit="yrs"
              label="Median CMO tenure"
              footnote="Illustrative sample, not measured."
            />
            <DataCard
              value={String(recentCount)}
              label="Moves, last 90 days"
              footnote="Editor-approved moves."
            />
          </div>
        </aside>
      </section>

      <section
        aria-labelledby="newsletter-title"
        className="mt-20 grid grid-cols-12 gap-8 border-y border-line py-12"
      >
        <div className="col-span-12 flex flex-col gap-3 lg:col-span-5">
          <MonoLabel>Newsletter</MonoLabel>
          <h2 id="newsletter-title" className="font-serif text-h2 text-text">
            {brand.newsletterName}, every week.
          </h2>
          <p className="text-small text-text-2">
            Who moved, what they were hired to do, and what the seat pays. Every item is reviewed by
            an editor.
          </p>
        </div>
        <div className="col-span-12 lg:col-span-6 lg:col-start-7">
          <NewsletterSignup consentText={consentText} source="home" />
        </div>
      </section>

      <SponsorSlot placement="home" className="mt-20" />

      <section aria-labelledby="roles-title" className="mt-20">
        <div className="mb-6 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <MonoLabel>Senior roles · comp on every listing</MonoLabel>
            <h2 id="roles-title" className="font-serif text-h2 text-text">
              Featured roles
            </h2>
          </div>
          <Link href="/jobs" className="label-mono hover:text-text">
            All jobs →
          </Link>
        </div>
        {roles.length ? (
          <div className="grid gap-6 md:grid-cols-3">
            {roles.map((r) => (
              <RoleCard key={r.id} role={r} />
            ))}
          </div>
        ) : (
          <p className="text-small text-text-3">No live roles right now.</p>
        )}
      </section>

      {more.length ? (
        <section aria-labelledby="more-title" className="mt-20 grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-3">
            <h2 id="more-title" className="label-mono">
              More from {brand.name}
            </h2>
          </div>
          <div className="col-span-12 grid gap-x-8 gap-y-10 md:grid-cols-2 lg:col-span-9">
            {more.map((a) => (
              <ArticleCard key={a.id} article={a} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
