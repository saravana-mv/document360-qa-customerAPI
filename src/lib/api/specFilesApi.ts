export interface SpecFileItem {
  name: string;
  size: number;
  lastModified: string;
  contentType: string;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
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

export async function listSpecFiles(prefix?: string): Promise<SpecFileItem[]> {
  const url = prefix
    ? `/api/spec-files?prefix=${encodeURIComponent(prefix)}`
    : `/api/spec-files`;
  const res = await apiFetch(url);
  return res.json() as Promise<SpecFileItem[]>;
}

export async function getSpecFileContent(name: string): Promise<string> {
  const res = await apiFetch(`/api/spec-files/content?name=${encodeURIComponent(name)}`);
  return res.text();
}

export async function uploadSpecFile(name: string, content: string, contentType?: string): Promise<void> {
  await apiFetch(`/api/spec-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content, ...(contentType ? { contentType } : {}) }),
  });
}

export async function deleteSpecFile(name: string): Promise<void> {
  await apiFetch(`/api/spec-files?name=${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

export async function renameSpecFile(name: string, newName: string): Promise<void> {
  await apiFetch(`/api/spec-files`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, newName }),
  });
}
