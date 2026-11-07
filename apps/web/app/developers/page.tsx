import { brand } from '@cmobeat/config';
import { MeshPanel, MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader, PublicPage, SampleNote } from '@/components/publication/PageHeader';
import { rateLimits, scopeLabels, apiScopes } from '@/lib/api-keys/scopes';
import { licence, MIN_CELL } from '@/lib/intelligence/filters';
import { siteUrl } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Data API',
  description: `Read-only API for ${brand.name} subscribers: CMO moves, live roles and comp aggregates.`,
  alternates: { canonical: '/developers' },
};

const endpoints = [
  {
    path: '/moves',
    scope: 'moves:read',
    body: 'Approved CMO appointments, departures and promotions, newest first, with public sources.',
    params: 'type, industry, market, company, from, to, limit, cursor',
  },
  { path: '/moves/{id}', scope: 'moves:read', body: 'One move.', params: '—' },
  {
    path: '/listings',
    scope: 'listings:read',
    body: 'Live senior marketing roles. Comp, currency and pay basis on every listing.',
    params: 'level, market, work_type, limit, cursor',
  },
  {
    path: '/comp',
    scope: 'comp:read',
    body: `p25, median and p75 of live listing ranges by level × market × currency × basis. Cells under ${MIN_CELL} listings are suppressed. Currencies are never converted.`,
    params: 'level, market, currency',
  },
  {
    path: '/companies',
    scope: 'moves:read',
    body: 'Companies’ public fields, alphabetical.',
    params: 'industry, market, limit, cursor',
  },
];

const errors: [string, string, string][] = [
  ['401', 'missing_key / invalid_key / revoked_key', 'Check the Authorization header and the key.'],
  ['403', 'subscription_inactive', 'Your company’s employer subscription is not active.'],
  ['403', 'insufficient_scope', 'The key can’t read this endpoint. Create one with the scope.'],
  ['400', 'invalid_request', 'A query parameter or cursor is not valid.'],
  ['404', 'not_found', 'No published record with that id.'],
  ['429', 'rate_limited', 'Slow down. Retry-After says when.'],
];

/** Code sample. Scrolls sideways on phones, so it is a focusable, labelled region for keyboards. */
function Code({ children, label }: { children: string; label: string }) {
  return (
    <pre
      tabIndex={0}
      role="region"
      aria-label={label}
      className="numeric overflow-x-auto rounded-control border border-line bg-surface p-4 text-small text-text"
    >
      <code>{children}</code>
    </pre>
  );
}

export default function DevelopersPage() {
  const base = `${siteUrl()}/api/v1`;
  const limits = rateLimits();
  return (
    <PublicPage>
      <PageHeader
        eyebrow="Developers · data API v1"
        title="The data, in your own tools."
        lede="Read-only JSON over HTTPS for employer subscribers: CMO moves, live roles and comp aggregates. Public data only. Nothing about candidates is ever available through the API."
        aside={<SampleNote />}
      />

      <div className="mt-12 grid grid-cols-12 gap-6 md:gap-8">
        <MeshPanel
          className="col-span-12 lg:col-span-7"
          eyebrow="1 · Authenticate"
          title="Bearer keys"
        >
          <p className="text-small text-text-2">
            Owners and admins of a subscribing company create keys at{' '}
            <Link href="/employer/api" className="text-text underline underline-offset-4">
              Employer · Data API
            </Link>
            . A key is shown once, starts with <span className="numeric">cmob_live_</span>, and is
            stored only as a one-way hash. Revoking it takes effect on the next request.
          </p>
          <div className="mt-4">
            <Code label="Example request">{`curl ${base}/moves?market=EU&limit=10 \\
  -H "Authorization: Bearer $CMOB_API_KEY"`}</Code>
          </div>
        </MeshPanel>

        <MeshPanel
          className="col-span-12 lg:col-span-5"
          eyebrow="2 · Scopes"
          title="What a key may read"
        >
          <ul className="flex flex-col gap-3">
            {apiScopes.map((s) => (
              <li key={s} className="flex flex-col">
                <span className="numeric text-small text-text">{s}</span>
                <span className="text-small text-text-2">{scopeLabels[s]}</span>
              </li>
            ))}
          </ul>
        </MeshPanel>

        <MeshPanel className="col-span-12" eyebrow="3 · Endpoints" title={`Base URL ${base}`}>
          <ul className="flex flex-col divide-y divide-line">
            {endpoints.map((e) => (
              <li key={e.path} className="grid gap-2 py-4 md:grid-cols-[14rem_1fr]">
                <span className="flex flex-col gap-1">
                  <span className="numeric text-small text-text">GET {e.path}</span>
                  <MonoLabel>{e.scope}</MonoLabel>
                </span>
                <span className="flex flex-col gap-1">
                  <span className="text-small text-text-2">{e.body}</span>
                  <span className="text-micro text-text-3">Parameters: {e.params}</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-small text-text-2">
            Full description:{' '}
            <a href="/api/v1/openapi.json" className="text-text underline underline-offset-4">
              OpenAPI 3.1 document
            </a>
            .
          </p>
        </MeshPanel>

        <MeshPanel
          className="col-span-12 lg:col-span-6"
          eyebrow="4 · Responses"
          title="One envelope"
        >
          <Code label="Response envelope">{`{
  "data": [ … ],
  "next_cursor": "eyJ…" | null,
  "meta": { "generated_at": "…", "count": 50, "licence": "…" }
}`}</Code>
          <p className="mt-4 text-small text-text-2">
            Lists are newest first. Pass <span className="numeric">next_cursor</span> back as{' '}
            <span className="numeric">cursor</span> until it is null.
          </p>
        </MeshPanel>

        <MeshPanel className="col-span-12 lg:col-span-6" eyebrow="5 · Limits" title="Rate limits">
          <p className="text-small text-text-2">
            {limits.perMinute} requests per minute and {limits.perDay.toLocaleString('en-US')} per
            UTC day, per key. Every response carries <span className="numeric">X-RateLimit-*</span>{' '}
            headers; a 429 carries <span className="numeric">Retry-After</span>. We log the path,
            status and row count of each request, never the response.
          </p>
        </MeshPanel>

        <MeshPanel className="col-span-12" eyebrow="6 · Errors" title="Plain codes">
          <table className="w-full text-small">
            <caption className="sr-only">Error codes</caption>
            <thead>
              <tr className="label-mono text-left">
                <th scope="col" className="py-2 font-normal">
                  Status
                </th>
                <th scope="col" className="py-2 font-normal">
                  Code
                </th>
                <th scope="col" className="py-2 font-normal">
                  Meaning
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {errors.map(([status, code, meaning]) => (
                <tr key={code}>
                  <td className="numeric py-2 text-text">{status}</td>
                  <td className="numeric py-2 text-text-2">{code}</td>
                  <td className="py-2 text-text-2">{meaning}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </MeshPanel>

        <MeshPanel className="col-span-12" eyebrow="Licence" title="How you may use the data">
          <p className="text-small text-text-2">{licence}</p>
        </MeshPanel>
      </div>
    </PublicPage>
  );
}
