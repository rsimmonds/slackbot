import { Button, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import { JobCard } from '@/components/jobs/JobCard';
import { getViewer } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import {
  compBasisLabel,
  compLabel,
  levelLabel,
  marketLabel,
  workTypeLabel,
} from '@/lib/jobs/format';
import { jobPostingJsonLd, serializeJsonLd } from '@/lib/jobs/jsonld';
import { getJob, isPubliclyVisible, relatedJobs } from '@/lib/jobs/queries';

export const dynamic = 'force-dynamic';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public job pages show live listings only, to everyone, including the company that posted it. */
const loadJob = cache(async (id: string) => {
  if (!uuid.test(id)) return null;
  const viewer = await getViewer();
  const job = await asViewer(viewer, (tx) => getJob(tx, id));
  return job && isPubliclyVisible(job) ? { job, viewer } : null;
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const found = await loadJob((await params).id);
  if (!found) return { title: 'Role not found', robots: { index: false } };
  const { job } = found;
  return {
    title: `${job.title}, ${job.companyName}`,
    description:
      `${levelLabel[job.level]} at ${job.companyName}. ${compLabel(job.compMin, job.compMax, job.currency, job.compBasis)}. ${job.scope ?? ''}`.trim(),
    alternates: { canonical: `/jobs/${job.listingId}` },
  };
}

function Fact({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="label-mono">{label}</dt>
      <dd className={numeric ? 'numeric text-small text-text' : 'text-small text-text'}>{value}</dd>
    </div>
  );
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const found = await loadJob((await params).id);
  if (!found) notFound();
  const { job, viewer } = found;
  const related = await asViewer(viewer, (tx) => relatedJobs(tx, job));
  const comp = compLabel(job.compMin, job.compMax, job.currency, job.compBasis);

  return (
    <main className="relative mx-auto max-w-[1280px] px-4 pt-12 pb-24 md:px-8 md:pt-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jobPostingJsonLd(job)) }}
      />
      <nav aria-label="Breadcrumb" className="label-mono mb-8">
        <Link href="/jobs" className="hover:text-text">
          Jobs
        </Link>{' '}
        / {levelLabel[job.level]}
      </nav>

      <div className="grid grid-cols-12 gap-8">
        <article className="col-span-12 flex flex-col gap-10 lg:col-span-8">
          <header className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <MonoLabel>
                {levelLabel[job.level]} · {workTypeLabel[job.workType]}
              </MonoLabel>
              {job.featured ? <MonoLabel className="text-text">Featured</MonoLabel> : null}
              {job.isSample ? <MonoLabel>Sample listing</MonoLabel> : null}
            </div>
            <h1 className="font-serif text-h2 text-text md:text-h1">{job.title}</h1>
            <p className="text-h4 text-text-2">
              {job.companyName} · {job.companyIndustry} · {job.companyStage}
            </p>
          </header>

          <dl className="grid grid-cols-2 gap-6 border-y border-line py-6 md:grid-cols-4">
            <Fact label={compBasisLabel(job.compBasis)} value={comp} numeric />
            <Fact label="Reports to" value={job.reportingLine ?? 'Not stated'} />
            <Fact label="Team" value={job.teamSize ? String(job.teamSize) : 'Not stated'} numeric />
            <Fact
              label="Location"
              value={
                job.remote
                  ? `Remote · ${marketLabel[job.market]}`
                  : (job.location ?? marketLabel[job.market])
              }
            />
          </dl>

          {job.scope ? (
            <section className="flex flex-col gap-3">
              <h2 className="label-mono">Scope</h2>
              <p className="max-w-2xl text-h4 leading-relaxed text-text">{job.scope}</p>
            </section>
          ) : null}

          {job.priorities.length ? (
            <section className="flex flex-col gap-4">
              <h2 className="label-mono">The mandate</h2>
              <ol className="flex flex-col divide-y divide-line border-y border-line">
                {job.priorities.map((p, i) => (
                  <li key={p} className="flex gap-6 py-4">
                    <span className="numeric w-6 shrink-0 text-small text-text-3">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-body text-text">{p}</span>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
        </article>

        <aside className="col-span-12 flex flex-col gap-6 lg:col-span-4">
          <MeshPanel eyebrow="Confidential apply" title="Your profile stays private">
            <p className="text-small text-text-2">
              Apply with a private proof-of-outcomes profile. {job.companyName} sees who you are
              only after you consent.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              {viewer ? (
                <>
                  <Button variant="human" disabled>
                    Apply confidentially
                  </Button>
                  <Status>Opens with private profiles in Phase 2</Status>
                </>
              ) : (
                <Button asChild variant="secondary">
                  <Link href={`/sign-in?next=${encodeURIComponent(`/jobs/${job.listingId}`)}`}>
                    Sign in to apply
                  </Link>
                </Button>
              )}
            </div>
          </MeshPanel>
          <MeshPanel eyebrow="Company">
            <dl className="grid grid-cols-2 gap-4">
              <Fact label="Industry" value={job.companyIndustry} />
              <Fact label="Stage" value={job.companyStage} />
              <Fact label="Size" value={job.companySize} numeric />
              <Fact label="Market" value={marketLabel[job.market]} />
            </dl>
          </MeshPanel>
          <p className="label-mono">
            Posted {job.publishedAt?.toISOString().slice(0, 10)} · Closes{' '}
            {job.expiresAt?.toISOString().slice(0, 10)}
          </p>
        </aside>
      </div>

      {related.length ? (
        <section
          aria-labelledby="related"
          className="mt-24 flex flex-col gap-6 border-t border-line pt-12"
        >
          <h2 id="related" className="font-serif text-h3 text-text">
            Related roles
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {related.map((r) => (
              <li key={r.listingId}>
                <JobCard job={r} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
