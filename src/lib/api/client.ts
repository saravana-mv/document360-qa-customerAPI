import type { ApiError } from "../../types/api.types";

// All API calls go through the server-side proxy at /api/proxy/*. The proxy
// looks up credentials (OAuth tokens, API keys) server-side and injects the
// appropriate Authorization header on forwarded requests.

const PROXY_BASE = "/api/proxy";
const DEFAULT_API_VERSION = "v3";

// Retained as a no-op for compatibility with setup.store — the upstream
// host is configured server-side, not in the browser.
let _apiVersion = DEFAULT_API_VERSION;

export function setApiBaseUrl(_url: string): void {
  // no-op: upstream URL is controlled server-side.
}

export function getApiBaseUrl(): string {
  return PROXY_BASE;
}

export function setApiVersion(version: string) {
  _apiVersion = version;
}

export function getApiVersion() {
  return _apiVersion;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /**
   * Left in the signature for compatibility — the proxy injects credentials
   * server-side, so whatever the caller passes is discarded.
   */
  token?: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = "GET", body, signal } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Ensure exactly one "/" between proxy base and upstream path.
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${PROXY_BASE}${normalizedPath}`;

  let attempts = 0;
  while (true) {
    attempts++;
    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

    if (response.status === 429 && attempts < 3) {
      const retryAfter = parseInt(response.headers.get("Retry-After") || "2", 10);
      await new Promise((res) => setTimeout(res, retryAfter * 1000));
      continue;
    }

    if (response.status === 401) {
      let detail = "";
      try { detail = await response.clone().text(); } catch { /* ignore */ }
      console.warn(`[apiClient] 401 on ${method} ${url} (attempt ${attempts}):`, detail);
      // Proxy returns 401 when credentials are missing or expired.
      // Retry once before declaring the session expired — the proxy may
      // still be propagating after a fresh sign-in.
      if (attempts < 2) {
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      // Notify the app so the UI can respond to the auth failure.
      console.warn("[apiClient] 401 persisted after retry — dispatching session-expired");
      window.dispatchEvent(new CustomEvent("session-expired"));
    }

    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let raw: unknown;
      try {
        raw = await response.json();
        const err = raw as Record<string, unknown>;
        const firstError = Array.isArray(err.errors) && err.errors.length > 0
          ? (err.errors[0] as Record<string, unknown>).message as string
          : undefined;
        message = firstError || (err.detail as string) || (err.message as string) || (err.title as string) || message;
      } catch { /* ignore */ }
      const error: ApiError = { status: response.status, message, raw };
      throw error;
    }

    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}

export const apiClient = {
  get: <T>(path: string, token?: string, signal?: AbortSignal) =>
    request<T>(path, { token, signal }),
  post: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "POST", body, token }),
  patch: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PATCH", body, token }),
  put: <T>(path: string, body: unknown, token?: string) =>
    request<T>(path, { method: "PUT", body, token }),
  delete: <T>(path: string, token?: string) =>
    request<T>(path, { method: "DELETE", token }),
};
