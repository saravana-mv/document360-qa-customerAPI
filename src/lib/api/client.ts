import type { ApiError } from "../../types/api.types";

// Phase 2: all D360 Customer API calls go through the server-side proxy at
// /api/d360/proxy/*. The browser no longer holds a bearer token — the proxy
// looks up the caller's Entra oid, fetches (or refreshes) the stored D360
// access token, and injects the Authorization header on forwarded requests.

const PROXY_BASE = "/api/d360/proxy";
const DEFAULT_API_VERSION = "v3";

// Retained as a no-op for compatibility with setup.store — the upstream D360
// host is pinned in the server-side proxy, not the browser.
let _apiVersion = DEFAULT_API_VERSION;

export function setApiBaseUrl(_url: string): void {
  // no-op: upstream URL is controlled by the Azure Function D360_API_BASE_URL.
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
   * Left in the signature for compatibility — the proxy injects the real
   * bearer token server-side, so whatever the caller passes is discarded.
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
      // Proxy returns 401 when the D360 token is missing/unrefreshable.
      // Notify the app so the UI falls back to the sign-in prompt.
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
