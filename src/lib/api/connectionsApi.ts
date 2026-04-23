import { getProjectHeaders } from "./projectHeader";

export interface Connection {
  id: string;
  projectId: string;
  name: string;
  provider: "oauth2";
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  hasSecret: boolean;
  scopes: string;
  redirectUri: string;
  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

export interface CreateConnectionPayload {
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  scopes?: string;
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
