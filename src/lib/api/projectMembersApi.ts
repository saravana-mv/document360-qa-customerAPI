// API client for project membership management.

export type ProjectRole = "owner" | "qa_manager" | "qa_engineer";

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
  status: "active" | "invited";
  addedBy: string;
  addedAt: string;
  updatedAt: string;
}

const BASE = "/api/project-members";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res;
}

export async function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const res = await apiFetch(`${BASE}?projectId=${encodeURIComponent(projectId)}`);
  return res.json() as Promise<ProjectMember[]>;
}

export async function addProjectMember(
  projectId: string, email: string, role: ProjectRole, displayName?: string,
): Promise<ProjectMember> {
  const res = await apiFetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, email, role, displayName }),
  });
  return res.json() as Promise<ProjectMember>;
}

export async function changeProjectMemberRole(
  memberId: string, projectId: string, role: ProjectRole,
): Promise<ProjectMember> {
  const res = await apiFetch(`${BASE}/${encodeURIComponent(memberId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, role }),
  });
  return res.json() as Promise<ProjectMember>;
}

export async function removeProjectMember(memberId: string, projectId: string): Promise<void> {
  await apiFetch(
    `${BASE}/${encodeURIComponent(memberId)}?projectId=${encodeURIComponent(projectId)}`,
    { method: "DELETE" },
  );
}
