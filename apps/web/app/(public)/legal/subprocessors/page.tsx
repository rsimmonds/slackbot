import { MonoLabel } from '@cmobeat/ui';
import type { Metadata } from 'next';
import { LegalPage, Section } from '@/components/legal/LegalPage';
import { subprocessors } from '@/lib/legal/subprocessors';

export const metadata: Metadata = {
  title: 'Subprocessors',
  description: 'The providers that process personal data for us.',
  alternates: { canonical: '/legal/subprocessors' },
};

export default function SubprocessorsPage() {
  return (
    <LegalPage
      title="Subprocessors"
      current="/legal/subprocessors"
      updated="7 November 2026"
      lede="Every provider that processes personal data on our behalf, what for, and what we send. We send each the minimum it needs."
    >
      <Section title="Current list">
        <ul className="!ml-0 flex flex-col divide-y divide-line border-y border-line [&>li]:!ml-0 [&>li]:list-none">
          {subprocessors.map((s) => (
            <li key={s.name} className="flex flex-col gap-2 py-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-h4 font-medium text-text">{s.name}</h3>
                <MonoLabel>
                  {s.planned ? 'Planned' : 'In use'} · {s.region}
                </MonoLabel>
              </div>
              <p className="text-small">{s.purpose}</p>
              <p className="text-small">
                <span className="text-text">Data: </span>
                {s.data}
              </p>
            </li>
          ))}
        </ul>
        <p>We&apos;ll update this page before adding a provider.</p>
      </Section>
    </LegalPage>
  );
}
