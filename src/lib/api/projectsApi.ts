// API client for FlowForge project management.

import { tryGetProjectHeaders } from "./projectHeader";

export interface ProjectDoc {
  id: string;
  tenantId: string;
  type: "project";
  name: string;
  description: string;
  visibility: "team" | "personal";
  memberCount: number;
  status: "active" | "archived";
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
}

const BASE = "/api/projects";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const projectHeaders = tryGetProjectHeaders();
  const merged: RequestInit = { ...init, headers: { ...projectHeaders, ...init?.headers } };
  const res = await fetch(url, merged);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res;
}

export async function listProjects(): Promise<ProjectDoc[]> {
  const res = await apiFetch(BASE);
  return res.json() as Promise<ProjectDoc[]>;
}

export async function createProject(
  name: string, description?: string, visibility: "team" | "personal" = "team",
): Promise<ProjectDoc> {
  const res = await apiFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description, visibility }),
  });
  return res.json() as Promise<ProjectDoc>;
}

export async function updateProject(id: string, data: { name?: string; description?: string }): Promise<ProjectDoc> {
  const res = await apiFetch(`${BASE}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json() as Promise<ProjectDoc>;
}

export async function deleteProject(id: string): Promise<{ deleted: boolean; cleanup: Record<string, number> }> {
  const res = await apiFetch(`${BASE}/${id}`, { method: "DELETE" });
  return res.json() as Promise<{ deleted: boolean; cleanup: Record<string, number> }>;
}
