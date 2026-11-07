import { Button, Field, HumanSeal, Input, MeshPanel, MonoLabel, Status } from '@cmobeat/ui';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DashboardFrame, EmptyState } from '@/components/Dashboard';
import { Select } from '@/components/form/Select';
import {
  invoiceText,
  invoiceTone,
  SearchStages,
  SearchTimeline,
} from '@/components/searches/SearchParts';
import { uuidPattern } from '@/lib/api';
import { requireArea } from '@/lib/auth';
import {
  allowedMoves,
  getConsoleSearch,
  SearchError,
  statusLabel,
  type SearchStatus,
} from '@/lib/searches/service';
import {
  feeFor,
  formatMinor,
  formatWhole,
  planLabel,
  ratePercent,
  termsOf,
} from '@/lib/searches/terms';
import { assignAction, placeAction, statusAction } from '../actions';

export const metadata = { title: 'Search' };

export default async function ConsoleSearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; warning?: string; done?: string }>;
}) {
  const viewer = await requireArea('staff');
  const { id } = await params;
  const sp = await searchParams;
  if (!uuidPattern.test(id)) notFound();
  let data;
  try {
    data = await getConsoleSearch(viewer, id);
  } catch (e) {
    if (e instanceof SearchError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }
  const { search: s, revealed, timeline } = data;
  const mine = s.talentPartnerId === viewer.id || viewer.roles.includes('admin');
  const status = s.status as SearchStatus;
  const moves = allowedMoves(status);
  const terms = termsOf(s.plan, s.feeTerms);
  const canPlace = mine && (status === 'shortlist' || status === 'interviewing');
  const compLabel = s.plan === 'ai_search' ? 'First-year cash compensation' : 'Monthly retainer';

  return (
    <DashboardFrame
      eyebrow={`${planLabel[s.plan]} · ${s.companyName}`}
      title={s.title}
      lede={`${ratePercent(terms.rateBps)} of the ${
        s.plan === 'ai_search'
          ? 'first-year cash compensation, on placement'
          : 'monthly retainer, each month'
      }. Terms accepted by the employer when they requested the search.`}
      aside={
        <Button asChild variant="secondary" size="sm">
          <Link href="/console/matches">Match review</Link>
        </Button>
      }
    >
      <div className="col-span-12 flex flex-col gap-2" aria-live="polite">
        {sp.error ? (
          <p role="alert" className="text-small text-critical-ink">
            {sp.error}
          </p>
        ) : null}
        {sp.warning ? <Status tone="machine">{sp.warning}</Status> : null}
        {sp.done === 'assigned' ? <Status tone="human">The search is yours.</Status> : null}
        {sp.done === 'moved' ? (
          <Status tone="human">Moved. The employer has been told.</Status>
        ) : null}
        {sp.done === 'placed' ? (
          <Status tone="good">Placement recorded. The employer has been invoiced.</Status>
        ) : null}
      </div>

      <MeshPanel className="col-span-12" eyebrow="Stage" title={statusLabel[status]}>
        <SearchStages status={status} />
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!s.talentPartnerId ? (
            <form action={assignAction.bind(null, s.id)}>
              <Button type="submit" variant="human">
                Take this search
              </Button>
            </form>
          ) : !mine ? (
            <MonoLabel>Another talent partner runs this search.</MonoLabel>
          ) : (
            moves.map((to) => (
              <form key={to} action={statusAction.bind(null, s.id)}>
                <input type="hidden" name="status" value={to} />
                <Button type="submit" variant={to === 'closed' ? 'ghost' : 'human'} size="sm">
                  {to === 'closed'
                    ? status === 'placed'
                      ? 'End the engagement'
                      : 'Close the search'
                    : `Move to ${statusLabel[to].toLowerCase()}`}
                </Button>
              </form>
            ))
          )}
        </div>
        {status === 'scoping' && mine ? (
          <p className="mt-4 text-micro text-text-3">
            Moving to sourcing runs blind matching for this mandate. Every proposal waits for your
            review.
          </p>
        ) : null}
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="Placement"
        title={s.placedMatchId ? 'Placed' : 'Record a hire'}
      >
        {s.placedMatchId && s.placementComp != null && s.placementCurrency ? (
          <div className="flex flex-col gap-4">
            <HumanSeal
              label="Placement recorded"
              reviewer="Talent partner"
              at={s.hiredAt ?? s.updatedAt}
            />
            <dl className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <dt className="label-mono">{compLabel}</dt>
                <dd className="numeric text-small text-text">
                  {formatWhole(s.placementComp, s.placementCurrency)}
                </dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="label-mono">{s.plan === 'ai_search' ? 'Fee' : 'Fee per month'}</dt>
                <dd className="numeric text-small text-text">
                  {formatMinor(feeFor(s.plan, s.feeTerms, s.placementComp), s.placementCurrency)}
                </dd>
              </div>
            </dl>
            {s.invoiceStatus ? (
              <Status tone={invoiceTone(s.invoiceStatus)}>
                Invoice {invoiceText(s.invoiceStatus).toLowerCase()}
              </Status>
            ) : null}
          </div>
        ) : !canPlace ? (
          <EmptyState>
            A placement is recorded from the shortlist or interview stage, for a candidate who has
            chosen to reveal themselves.
          </EmptyState>
        ) : revealed.length === 0 ? (
          <EmptyState>
            No candidate has revealed themselves for this mandate yet. Identity is shared only with
            the candidate’s consent.
          </EmptyState>
        ) : (
          <form action={placeAction.bind(null, s.id)} className="flex flex-col gap-5">
            <Field label="Candidate (revealed)">
              {(fid) => (
                <Select id={fid} name="matchId" required defaultValue="">
                  <option value="" disabled>
                    Choose who accepted
                  </option>
                  {revealed.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.headline ?? 'Revealed candidate'} · {r.id.slice(0, 8)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field
              label={`${compLabel} · ${s.currency}`}
              hint={`Whole ${s.currency}, no cents. The fee is ${ratePercent(terms.rateBps)} of this.`}
            >
              {(fid) => (
                <Input id={fid} name="comp" inputMode="numeric" required placeholder="400000" />
              )}
            </Field>
            <div>
              <Button type="submit" variant="human">
                Record placement and invoice
              </Button>
            </div>
          </form>
        )}
      </MeshPanel>

      <MeshPanel className="col-span-12 lg:col-span-5" eyebrow="History" title="Timeline">
        <SearchTimeline entries={timeline} />
      </MeshPanel>
    </DashboardFrame>
  );
}
