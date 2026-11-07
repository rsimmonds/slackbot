import { DashboardFrame } from '@/components/Dashboard';

/** Shown to staff who aren't admins. RLS would refuse the data anyway. */
export function AdminOnly() {
  return (
    <DashboardFrame
      eyebrow="Sponsorships"
      title="Sponsorships are managed by admins."
      lede="Ask an admin to book or change a placement."
    >
      <div className="col-span-12" />
    </DashboardFrame>
  );
}
