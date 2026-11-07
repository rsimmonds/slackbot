import { MeshPanel, MonoLabel } from '@cmobeat/ui';
import Link from 'next/link';
import { DashboardFrame } from '@/components/Dashboard';
import { AcknowledgeNotice, BeginInterview, Uploads } from '@/components/profile/Onboarding';
import { requireArea } from '@/lib/auth';
import { asViewer } from '@/lib/db';
import { ensureProfile, readContext } from '@/lib/profile/profile';
import { signedFileUrl } from '@/lib/storage/signed-url';

export const metadata = { title: 'Build your profile' };

export default async function ProfileStart() {
  const viewer = await requireArea('candidate');
  const { profile, ctx } = await asViewer(viewer, async (tx) => {
    const profile = await ensureProfile(tx, viewer);
    return { profile, ctx: await readContext(profile) };
  });
  const acked = profile.aiNoticeAckAt;
  const items = ctx.files.map((f) => ({ ...f, downloadUrl: signedFileUrl(f.id, viewer.id) }));

  return (
    <DashboardFrame
      eyebrow="Candidate · private"
      title="Before we begin."
      lede="Three steps. Nothing here is shared with anyone, and you approve every line of your profile before it is saved."
    >
      <MeshPanel
        className="col-span-12 lg:col-span-7"
        eyebrow="1 · How AI is used"
        title="A plain note on AI"
      >
        <div className="flex flex-col gap-4 text-small text-text-2">
          <p>
            An AI interviewer asks you about your results, the teams you have built and the role you
            want next, one question at a time. It drafts your profile from your answers. You
            approve, edit or remove every line before anything is saved.
          </p>
          <p>
            Later, if you choose to be visible, AI suggests matches between your profile and roles.
            It never sees your name, photo, age, gender, nationality or other personal attributes,
            and it never decides anything. A person reviews every match before an employer sees it,
            and your identity is only revealed with your consent each time.
          </p>
          <p>
            Your answers are encrypted. You can export or delete everything at any time.{' '}
            <Link href="/legal/ai" className="text-text underline underline-offset-4">
              Read the full AI notice
            </Link>
            .
          </p>
          <div className="pt-2">
            <AcknowledgeNotice acknowledgedAt={acked ? acked.toISOString() : null} />
          </div>
        </div>
      </MeshPanel>

      <MeshPanel
        className="col-span-12 lg:col-span-5"
        eyebrow="2 · Optional"
        title="Add your résumé"
      >
        <p className="mb-4 text-small text-text-2">
          It helps the interviewer ask sharper questions. PDF only. Contact details and personal
          attributes are removed before it is read.
        </p>
        <Uploads items={items} disabled={!acked} />
      </MeshPanel>

      <MeshPanel className="col-span-12" eyebrow="3 · Interview" title="About 15 questions">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="max-w-xl text-small text-text-2">
            Take your time. You can stop and resume whenever you like. Give numbers where you have
            them; approximate is fine if it is honest.
          </p>
          <BeginInterview disabled={!acked} />
        </div>
        <MonoLabel className="mt-6 block">Encrypted · visible to no one</MonoLabel>
      </MeshPanel>
    </DashboardFrame>
  );
}
