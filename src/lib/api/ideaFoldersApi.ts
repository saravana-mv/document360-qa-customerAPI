import { getProjectHeaders } from "./projectHeader";

export interface IdeaFolderDoc {
  id: string;
  projectId: string;
  type: "idea_folder";
  name: string;
  path: string;
  parentPath: string | null;
  order: number;
  createdAt: string;
  createdBy: { oid: string; name: string };
  updatedAt: string;
  updatedBy: { oid: string; name: string };
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent("session-expired"));
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

export async function listFolders(): Promise<IdeaFolderDoc[]> {
  const res = await apiFetch("/api/ideas/folders");
  return res.json() as Promise<IdeaFolderDoc[]>;
}

export async function createFolder(
  name: string,
  parentPath: string | null,
): Promise<IdeaFolderDoc> {
  const res = await apiFetch("/api/ideas/folders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentPath }),
  });
  return res.json() as Promise<IdeaFolderDoc>;
}

export async function updateFolder(
  id: string,
  patch: { name?: string; order?: number },
): Promise<IdeaFolderDoc> {
  const res = await apiFetch("/api/ideas/folders", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...patch }),
  });
  return res.json() as Promise<IdeaFolderDoc>;
}

export async function deleteFolder(id: string): Promise<void> {
  await apiFetch(`/api/ideas/folders?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
