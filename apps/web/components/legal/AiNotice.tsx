import { Iris, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';

/**
 * Plain-language notice that AI assists matching (spec 9.7). Show it wherever a candidate shares
 * data that AI will read: the profile interview, visibility settings and matches.
 */
export function AiNotice({ className }: { className?: string }) {
  return (
    <aside
      aria-label="How AI is used"
      className={`flex items-start gap-4 rounded-panel border border-line bg-surface p-5 ${className ?? ''}`}
    >
      <Iris state="idle" size={32} label="AI assistant" />
      <div className="flex flex-col gap-2">
        <MonoLabel className="text-synapse-ink">AI assists, people decide</MonoLabel>
        <p className="text-small text-text-2">
          AI helps write your profile and suggests matches from your outcomes. It never sees your
          name, photo, age, gender or nationality when matching. A person reviews every match before
          anyone is contacted, and no one learns who you are without your consent.
        </p>
        <Link href="/legal/ai" className="text-small text-text underline underline-offset-4">
          How we use AI, and how to ask for a human review
        </Link>
      </div>
    </aside>
  );
}
