/** Client-side JSON calls to the profile API. Returns data or a plain-language error. */
export async function callApi<T = unknown>(
  url: string,
  init: { method?: string; body?: unknown } = {},
): Promise<{ data?: T; error?: string }> {
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.body === undefined ? undefined : { 'content-type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const json = (await res.json().catch(() => ({}))) as { data?: T; error?: string };
    if (!res.ok) return { error: json.error ?? 'Something went wrong. Please try again.' };
    return { data: (json.data ?? json) as T };
  } catch {
    return { error: 'We could not reach the server. Check your connection and try again.' };
  }
}
