export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const TOKEN_KEY = "qrush.session";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

type Options = Omit<RequestInit, "body"> & { json?: unknown; body?: BodyInit; auth?: boolean };

export async function api<T>(path: string, { json, auth = true, headers, ...init }: Options = {}): Promise<T> {
  const h = new Headers(headers);
  const token = auth ? getToken() : null;
  if (token) h.set("authorization", `Bearer ${token}`);
  if (json !== undefined) h.set("content-type", "application/json");
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: h,
    body: json !== undefined ? JSON.stringify(json) : init.body,
    method: init.method ?? (json !== undefined ? "POST" : "GET"),
    // Never hang the UI on a stalled request; uploads get longer.
    signal: init.signal ?? AbortSignal.timeout(init.body instanceof FormData || json !== undefined ? 90_000 : 10_000),
  });
  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    const err = data && typeof data === "object" && "error" in data ? (data as { error: unknown }).error : null;
    const message = (typeof err === "string" && err) || res.statusText || "Request failed";
    throw new ApiError(res.status, message);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text };
  }
}
