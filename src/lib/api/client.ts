import type { ApiError } from "../../types/api.types";

const DEFAULT_BASE_URL = "https://apihub.berlin.document360.net";

let _baseUrl = DEFAULT_BASE_URL;

/** Called by setup store on init and when the user changes the base URL. */
export function setApiBaseUrl(url: string) {
  _baseUrl = url.replace(/\/$/, ""); // strip trailing slash
}

export function getApiBaseUrl() {
  return _baseUrl;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  token: string;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions): Promise<T> {
  const { method = "GET", body, token, signal } = options;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  let attempts = 0;
  while (true) {
    attempts++;
    const response = await fetch(`${_baseUrl}${path}`, {
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
  get: <T>(path: string, token: string, signal?: AbortSignal) =>
    request<T>(path, { token, signal }),
  post: <T>(path: string, body: unknown, token: string) =>
    request<T>(path, { method: "POST", body, token }),
  patch: <T>(path: string, body: unknown, token: string) =>
    request<T>(path, { method: "PATCH", body, token }),
  put: <T>(path: string, body: unknown, token: string) =>
    request<T>(path, { method: "PUT", body, token }),
  delete: <T>(path: string, token: string) =>
    request<T>(path, { method: "DELETE", token }),
};
