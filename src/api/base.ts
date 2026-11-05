// The API address. On one origin (docker compose: nginx proxies /api) it is empty,
// and paths are relative. When the SPA and the API are on different domains (web.<domain> and
// api.<domain>), the address comes from /config.json, which the web container writes at
// start from API_BASE_URL: one image fits any domains.

let apiBase = "";

export function setApiBase(url: string | undefined | null) {
  apiBase = (url ?? "").replace(/\/+$/, "");
}

export function getApiBase(): string {
  return apiBase;
}

/** The full address of an API path: `/api/v1/...` → `https://api.<domain>/api/v1/...`. */
export function apiUrl(path: string): string {
  return apiBase + path;
}

/** Loads /config.json; its absence (dev server, compose) is no error. */
export async function loadRuntimeConfig(fetchImpl: typeof fetch = fetch): Promise<void> {
  try {
    const res = await fetchImpl("/config.json", { cache: "no-store" });
    if (!res.ok) return;
    const cfg = (await res.json()) as { apiBaseUrl?: string };
    setApiBase(cfg.apiBaseUrl);
  } catch {
    // No file, or it is not JSON: we work with the API on the same origin.
  }
}
