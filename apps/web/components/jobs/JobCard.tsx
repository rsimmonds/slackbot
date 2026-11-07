import { MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import {
  compBasisLabel,
  compLabel,
  levelLabel,
  marketLabel,
  workTypeLabel,
} from '@/lib/jobs/format';
import type { JobRow } from '@/lib/jobs/queries';

/** One role in a list. Comp is always shown, with currency and basis. */
export function JobCard({ job }: { job: JobRow }) {
  return (
    <article className="mesh relative flex flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonoLabel>
          {levelLabel[job.level]} · {workTypeLabel[job.workType]}
        </MonoLabel>
        {job.featured ? <MonoLabel className="text-text">Featured</MonoLabel> : null}
      </div>
      <div className="flex flex-col gap-1">
        <h3 className="font-serif text-h3 leading-tight text-text">
          <Link
            href={`/jobs/${job.listingId}`}
            className="after:absolute after:inset-0 hover:underline hover:decoration-line-strong hover:underline-offset-4"
          >
            {job.title}
          </Link>
        </h3>
        <p className="text-small text-text-2">
          {job.companyName} · {job.companyIndustry} · {job.companyStage}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4">
        <div className="col-span-2 flex flex-col gap-1">
          <dt className="label-mono">{compBasisLabel(job.compBasis)}</dt>
          <dd className="numeric text-small text-text">
            {compLabel(job.compMin, job.compMax, job.currency, job.compBasis)}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="label-mono">Location</dt>
          <dd className="text-small text-text">
            {job.remote ? 'Remote' : (job.location ?? marketLabel[job.market])}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="label-mono">Reports to</dt>
          <dd className="text-small text-text">{job.reportingLine ?? '—'}</dd>
        </div>
      </dl>
    </article>
  );
}
