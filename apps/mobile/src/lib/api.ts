/** Set `EXPO_PUBLIC_API_URL` in `.env` — e.g. `http://10.0.2.2:3333` on Android emulator. */
const baseUrl =
  (typeof process !== "undefined" && process.env.EXPO_PUBLIC_API_URL) ||
  "http://localhost:3333";

export function getApiBaseUrl(): string {
  return baseUrl.replace(/\/$/, "");
}

export async function apiJson<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {}
): Promise<T> {
  const url = `${getApiBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  const body = options.body;
  if (body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (options.token) {
    headers.set("Authorization", `Bearer ${options.token}`);
  }

  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      throw new Error(text || res.statusText);
    }
  }

  if (!res.ok) {
    const err = json as { error?: { message?: string } } | undefined;
    const msg =
      err && typeof err === "object" && err.error?.message
        ? err.error.message
        : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return json as T;
}

export type MeResponse = {
  user: { id: string; email: string };
  householdId: string;
  role: string;
  memberships?: { householdId: string; householdName: string; role: string }[];
};

export type RegisterResponse = {
  token: string;
  userId: string;
  householdId: string;
};

export type LoginResponse = {
  token: string;
  userId: string;
};
