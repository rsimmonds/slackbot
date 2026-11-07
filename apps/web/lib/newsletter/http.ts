/** Reads a JSON or form-encoded body into a plain object. Repeated form keys become arrays. */
export async function readBody(req: Request): Promise<Record<string, unknown>> {
  const type = req.headers.get('content-type') ?? '';
  if (type.includes('application/json')) {
    try {
      const body = (await req.json()) as unknown;
      return body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  if (type.includes('application/x-www-form-urlencoded') || type.includes('multipart/form-data')) {
    const form = await req.formData();
    const out: Record<string, unknown> = {};
    for (const key of new Set(form.keys())) {
      const all = form.getAll(key).map(String);
      out[key] = all.length > 1 || key === 'topics' ? all : all[0];
    }
    return out;
  }
  return {};
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
