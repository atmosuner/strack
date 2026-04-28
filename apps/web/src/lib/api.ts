const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333";

export async function apiJson<T>(
  path: string,
  opts: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const url = `${BASE_URL.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(opts.headers);
  headers.set("Accept", "application/json");
  if (opts.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (opts.token) {
    headers.set("Authorization", `Bearer ${opts.token}`);
  }

  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();
  let json: unknown;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(text || res.statusText);
    }
  }
  if (!res.ok) {
    const err = json as { error?: { message?: string } } | undefined;
    throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
  }
  return json as T;
}
