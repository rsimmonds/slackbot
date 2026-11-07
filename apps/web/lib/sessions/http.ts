import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { SessionError } from '@cmobeat/ai/interview';
import { uuidPattern } from '@/lib/api';

/** Map session errors to JSON; rethrow anything unexpected. */
export function sessionError(e: unknown) {
  if (e instanceof ZodError)
    return NextResponse.json(
      { error: e.issues[0]?.message ?? 'Invalid input', issues: e.issues.map((i) => i.message) },
      { status: 400 },
    );
  if (e instanceof SessionError)
    return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export function requireUuid(id: string) {
  if (!uuidPattern.test(id)) throw new SessionError('Session not found.', 404);
}

export async function readJsonBody(req: Request): Promise<unknown> {
  if (!req.headers.get('content-type')?.includes('application/json'))
    throw new SessionError('Send JSON.', 415);
  try {
    return await req.json();
  } catch {
    throw new SessionError('Body must be JSON.', 400);
  }
}

/** Server-Sent Events from an async iterable of { type, ... } objects. */
export function sseResponse(events: AsyncIterable<{ type: string }>): Response {
  const encoder = new TextEncoder();
  const iterator = events[Symbol.asyncIterator]();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iterator.next();
        if (done) {
          controller.close();
          return;
        }
        controller.enqueue(
          encoder.encode(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`),
        );
      } catch (e) {
        const message =
          e instanceof SessionError ? e.message : 'Something went wrong. Your answers are saved.';
        const status = e instanceof SessionError ? e.status : 500;
        if (!(e instanceof SessionError)) console.error(e);
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ type: 'error', message, status })}\n\n`,
          ),
        );
        controller.close();
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });
  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      'x-accel-buffering': 'no',
    },
  });
}
