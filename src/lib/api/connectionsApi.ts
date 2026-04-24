import { getProjectHeaders } from "./projectHeader";

export type ConnectionProvider = "oauth2" | "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie";

export interface Connection {
  id: string;
  projectId: string;
  name: string;
  provider: ConnectionProvider;

  // OAuth-specific
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  hasSecret: boolean;
  scopes?: string;
  redirectUri?: string;

  // Token-based
  hasCredential: boolean;
  authHeaderName?: string;
  authQueryParam?: string;

  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

export interface CreateConnectionPayload {
  name: string;
  provider: ConnectionProvider;
  // OAuth
  authorizationUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  clientSecret?: string;
  scopes?: string;
  // Token-based
  credential?: string;
  authHeaderName?: string;
  authQueryParam?: string;
}

export type UpdateConnectionPayload = Partial<CreateConnectionPayload>;

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.clone().json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

export async function listConnections(): Promise<Connection[]> {
  const res = await apiFetch("/api/connections");
  return res.json() as Promise<Connection[]>;
}

export async function createConnection(payload: CreateConnectionPayload): Promise<Connection> {
  const res = await apiFetch("/api/connections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Connection>;
}

export async function updateConnection(id: string, payload: UpdateConnectionPayload): Promise<Connection> {
  const res = await apiFetch(`/api/connections/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json() as Promise<Connection>;
}

export async function deleteConnection(id: string): Promise<void> {
  await apiFetch(`/api/connections/${id}`, { method: "DELETE" });
}
