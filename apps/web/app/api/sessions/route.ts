import { NextResponse } from 'next/server';
import { getViewer } from '@/lib/auth';
import { readJsonBody, sessionError } from '@/lib/sessions/http';
import { startInput, startSession } from '@/lib/sessions/service';

/** POST /api/sessions — start an interview. Body: { kind: "mandate" | "profile" }. */
export async function POST(req: Request) {
  try {
    const { kind } = startInput.parse(await readJsonBody(req));
    const session = await startSession(await getViewer(), kind);
    return NextResponse.json({ data: session }, { status: 201 });
  } catch (e) {
    return sessionError(e);
  }
}
