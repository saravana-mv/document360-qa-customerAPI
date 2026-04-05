import type { ApiError } from "../../types/api.types";

export const BASE_URL = "https://apihub.berlin.document360.net";

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
    const response = await fetch(`${BASE_URL}${path}`, {
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
      try {
        const err = await response.json();
        message = err.message || err.title || message;
      } catch { /* ignore */ }
      const error: ApiError = { status: response.status, message };
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
