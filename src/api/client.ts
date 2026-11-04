// Fetch wrapper: JSON, cookies, CSRF double-submit and stable error codes.

import { apiUrl } from "./base";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : "";
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined;

/** A change refused with git_account_required (FTR.HMR.CMN-0006 tech §1.1): the
 * interface offers to link the git account and repeats the change after it. */
export interface DeferredChange {
  method: string;
  path: string;
  body?: Body;
}

const gitAccountListeners = new Set<(c: DeferredChange) => void>();

export function onGitAccountRequired(h: (c: DeferredChange) => void): () => void {
  gitAccountListeners.add(h);
  return () => gitAccountListeners.delete(h);
}

export async function request<T>(method: string, path: string, body?: Body, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (method !== "GET" && method !== "HEAD") headers["X-CSRF-Token"] = csrfToken();
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let res: Response;
  try {
    // include: the API may live on api.<domain> while the SPA is on web.<domain>.
    res = await fetch(apiUrl(path), { method, headers, body: payload, credentials: "include", ...init });
  } catch {
    throw new ApiError(0, "network", "network error");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? safeJSON(text) : undefined;
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: Record<string, unknown> } })?.error;
    const e = new ApiError(res.status, err?.code ?? `http_${res.status}`, err?.message ?? res.statusText, err?.details ?? {});
    if (e.code === "git_account_required") gitAccountListeners.forEach((h) => h({ method, path, body }));
    throw e;
  }
  return data as T;
}

function safeJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A file of the API with the session of the user; an error comes as from `request`. */
async function raw(path: string): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(apiUrl(path), { credentials: "include" });
  } catch {
    throw new ApiError(0, "network", "network error");
  }
  if (!res.ok) {
    const text = await res.text();
    const err = (text ? safeJSON(text) : undefined) as { error?: { code?: string; message?: string; details?: Record<string, unknown> } } | undefined;
    throw new ApiError(res.status, err?.error?.code ?? `http_${res.status}`, err?.error?.message ?? res.statusText, err?.error?.details);
  }
  return res;
}

export const api = {
  raw,
  blob: async (path: string) => (await raw(path)).blob(),
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: Body) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body?: Body) => request<T>("PUT", path, body ?? {}),
  patch: <T>(path: string, body?: Body) => request<T>("PATCH", path, body ?? {}),
  del: <T>(path: string, body?: Body) => request<T>("DELETE", path, body),
  upload: <T>(path: string, form: FormData) => request<T>("POST", path, form),
};

export function qs(params: Record<string, string | number | undefined | null>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}
