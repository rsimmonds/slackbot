import { Button, Iris, MeshPanel, MonoLabel } from '@cmobeat/ui';
import { DashboardFrame } from '@/components/Dashboard';
import { requireArea } from '@/lib/auth';
import { startMandateAction } from '../actions';

export const metadata = { title: 'New mandate session' };

const steps = [
  [
    'Fifteen questions, one at a time',
    'Why now, what must be true in twelve months, who they will disagree with, how you will judge the first 90 days, and the comp you intend to offer.',
  ],
  [
    'A draft, not a decision',
    'I draft the mandate, scorecard and interview plan from your answers. You edit every line, then confirm it.',
  ],
  [
    'A benchmark from real listings',
    'Comp is compared with live and recent CMO Beat listings at the same level and market. I never estimate pay.',
  ],
  [
    'Private to your company',
    'Your answers are encrypted. Save and return at any point; the session picks up where you left it.',
  ],
] as const;

export default async function NewMandatePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireArea('employer');
  const { error } = await searchParams;
  return (
    <DashboardFrame
      eyebrow="Mandate Builder"
      title="Before you hire, define the seat."
      lede="Best done with the CEO or a board member in the room. It takes about twenty minutes."
      aside={<Iris state="idle" size={72} />}
    >
      <MeshPanel
        className="col-span-12 lg:col-span-8"
        eyebrow="What happens"
        title="How the session works"
      >
        <ol className="flex flex-col divide-y divide-line">
          {steps.map(([title, body], i) => (
            <li key={title} className="flex gap-4 py-4">
              <MonoLabel className="w-6 shrink-0 pt-1">{String(i + 1).padStart(2, '0')}</MonoLabel>
              <span className="flex flex-col gap-1">
                <span className="text-small text-text">{title}</span>
                <span className="text-small text-text-2">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </MeshPanel>
      <MeshPanel className="col-span-12 lg:col-span-4" eyebrow="Ready" title="Begin when you are">
        <p className="text-small text-text-2">
          AI asks the questions and drafts the document. A person — you — approves it before it is
          used anywhere.
        </p>
        {error ? (
          <p role="alert" className="mt-4 text-small text-critical-ink">
            {error}
          </p>
        ) : null}
        <form action={startMandateAction} className="mt-6">
          <Button type="submit" variant="human" size="lg" className="w-full">
            Begin session
          </Button>
        </form>
      </MeshPanel>
    </DashboardFrame>
  );
}
