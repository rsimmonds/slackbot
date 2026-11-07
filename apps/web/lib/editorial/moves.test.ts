import { adminDb, closeDb, moves } from '@cmobeat/db';
import { eq } from 'drizzle-orm';
import { auditFor, createDraftMove, editInput, viewers } from '@/test/fixtures';
import { EditorialError } from './access';
import {
  approveMove,
  confidenceLabel,
  diffMove,
  getMoveForReview,
  listMoveDrafts,
  listMoves,
  moveFiltersSchema,
  rejectMove,
  saveMove,
} from './moves';

afterAll(() => closeDb());

const filters = (q: Record<string, string> = {}) => moveFiltersSchema.parse(q);

describe('move review', () => {
  it('lists drafts only for editors', async () => {
    const draft = await createDraftMove();
    const queue = await listMoveDrafts(viewers.editor);
    expect(queue.some((m) => m.id === draft.id)).toBe(true);
    await expect(listMoveDrafts(viewers.talent)).rejects.toBeInstanceOf(EditorialError);
    await expect(listMoveDrafts(viewers.reader)).rejects.toThrow('Editorial is for editors.');
  });

  it('never shows drafts publicly, even when a non-editor asks for them', async () => {
    const draft = await createDraftMove();
    const anon = await listMoves(null, filters({ status: 'draft', limit: '100' }));
    expect(anon).toEqual([]); // RLS: drafts are invisible to anonymous visitors
    const reader = await listMoves(viewers.reader, filters({ status: 'draft', limit: '100' }));
    expect(reader.some((m) => m.id === draft.id)).toBe(false);
  });

  it('saves edits and records a field-level diff in the audit log', async () => {
    const draft = await createDraftMove();
    const changes = await saveMove(
      viewers.editor,
      draft.id,
      editInput(draft, { title: 'Chief Growth Officer' }),
    );
    expect(Object.keys(changes)).toEqual(['title']);
    const [entry] = await auditFor(draft.id);
    expect(entry).toMatchObject({ action: 'move.edited', actorId: viewers.editor.id });
    expect(entry!.metadata).toEqual({
      changes: { title: { from: 'Chief Marketing Officer', to: 'Chief Growth Officer' } },
    });
  });

  it('does not write an audit entry when nothing changed', async () => {
    const draft = await createDraftMove();
    expect(await saveMove(viewers.editor, draft.id, editInput(draft))).toEqual({});
    expect(await auditFor(draft.id)).toHaveLength(0);
  });

  it('approves with edits in one step and publishes it', async () => {
    const draft = await createDraftMove();
    await approveMove(
      viewers.editor,
      draft.id,
      editInput(draft, { summary: 'Edited by a human.' }),
    );
    const [row] = await adminDb().select().from(moves).where(eq(moves.id, draft.id));
    expect(row).toMatchObject({
      status: 'approved',
      approvedBy: viewers.editor.id,
      summary: 'Edited by a human.',
    });
    const pub = await listMoves(null, filters({ q: draft.personName }));
    expect(pub.map((m) => m.id)).toEqual([draft.id]);
    const actions = (await auditFor(draft.id)).map((a) => a.action).sort();
    expect(actions).toEqual(['move.approved', 'move.edited']);
  });

  it('requires at least one source', async () => {
    const draft = await createDraftMove();
    await expect(
      approveMove(viewers.editor, draft.id, editInput(draft, { sources: [] })),
    ).rejects.toThrow(/At least one public source/);
  });

  it('refuses approval from non-editors at the app layer and at the database', async () => {
    const draft = await createDraftMove();
    await expect(approveMove(viewers.talent, draft.id)).rejects.toThrow(
      'Editorial is for editors.',
    );
    // Bypass the app check: RLS still blocks the update for a non-editor.
    const { withUser } = await import('@cmobeat/db');
    const updated = await withUser(
      { userId: viewers.talent.id, roles: viewers.talent.roles },
      (tx) =>
        tx
          .update(moves)
          .set({ status: 'approved', approvedBy: viewers.talent.id })
          .where(eq(moves.id, draft.id))
          .returning(),
    );
    expect(updated).toEqual([]);
  });

  it('cannot approve in someone else’s name (RLS)', async () => {
    const draft = await createDraftMove();
    const { withUser } = await import('@cmobeat/db');
    await expect(
      withUser({ userId: viewers.editor.id, roles: viewers.editor.roles }, (tx) =>
        tx
          .update(moves)
          .set({ status: 'approved', approvedBy: viewers.admin.id })
          .where(eq(moves.id, draft.id)),
      ),
    ).rejects.toThrow();
  });

  it('rejects with a note and keeps it out of public view', async () => {
    const draft = await createDraftMove();
    await expect(rejectMove(viewers.editor, draft.id, { note: '' })).rejects.toThrow();
    await rejectMove(viewers.editor, draft.id, { note: 'Single anonymous source.' });
    const [row] = await adminDb().select().from(moves).where(eq(moves.id, draft.id));
    expect(row).toMatchObject({ status: 'rejected', reviewNote: 'Single anonymous source.' });
    expect((await auditFor(draft.id))[0]).toMatchObject({ action: 'move.rejected' });
  });

  it('will not re-open a published move', async () => {
    const draft = await createDraftMove();
    await approveMove(viewers.editor, draft.id);
    await expect(
      rejectMove(viewers.editor, draft.id, { note: 'Too late now.' }),
    ).rejects.toMatchObject({ code: 'conflict' });
  });

  it('loads the review screen with company options', async () => {
    const draft = await createDraftMove();
    const r = await getMoveForReview(viewers.editor, draft.id);
    expect(r?.move.id).toBe(draft.id);
    expect(r?.companies.length).toBeGreaterThan(30);
  });

  it('filters the public list by type and date', async () => {
    const rows = await listMoves(
      null,
      filters({ type: 'departed', from: '2000-01-01', limit: '100' }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.moveType === 'departed' && r.status === 'approved')).toBe(true);
  });
});

describe('helpers', () => {
  it('describes confidence as a qualitative range', () => {
    expect(confidenceLabel(0.9)).toEqual({ label: 'High confidence', range: '80–100' });
    expect(confidenceLabel(0.5)?.label).toBe('Low confidence');
    expect(confidenceLabel(null)).toBeNull();
  });

  it('diffs only changed fields', async () => {
    const draft = await createDraftMove();
    const r = await getMoveForReview(viewers.editor, draft.id);
    expect(diffMove(r!.move, editInput(draft, { personName: 'New Name' }) as never)).toEqual({
      personName: { from: draft.personName, to: 'New Name' },
    });
  });
});
