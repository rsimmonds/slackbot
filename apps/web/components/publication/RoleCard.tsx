import { MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { compLabel, levelLabel } from '@/lib/publication/labels';
import type { RoleCard as Role } from '@/lib/publication/queries';

/** A live role. Comp is always shown, with its currency. */
export function RoleCard({ role }: { role: Role }) {
  const where =
    [role.location, role.remote ? 'Remote' : null].filter(Boolean).join(' · ') ||
    'Location not stated';
  return (
    <MeshPanel className="flex h-full flex-col gap-4" padded>
      <div className="flex items-center justify-between gap-3">
        <MonoLabel>{levelLabel[role.level]}</MonoLabel>
        {role.featured ? <MonoLabel className="text-text-2">Featured</MonoLabel> : null}
      </div>
      <h3 className="text-h4 font-medium text-text">
        <Link href={`/jobs/${role.id}`} className="underline-offset-4 hover:underline">
          {role.title}
        </Link>
      </h3>
      <p className="text-small text-text-2">{role.company}</p>
      <div className="mt-auto flex flex-col gap-1 border-t border-line pt-4">
        <span className="numeric text-small text-text">
          {compLabel(role.compMin, role.compMax, role.currency, role.compBasis)}
        </span>
        <span className="text-micro text-text-3">
          {role.workType === 'fractional' ? 'Fractional' : 'Full-time'} · {where}
        </span>
      </div>
    </MeshPanel>
  );
}
