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

export async function uploadSpecFile(name: string, content: string): Promise<void> {
  await apiFetch(`/api/spec-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
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

/** Stream flow XML from Claude via SSE. Calls onChunk for each text delta. */
export async function generateFlowStream(
  prompt: string,
  specFiles: string[],
  onChunk: (text: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, specFiles, stream: true }),
    signal,
  });

  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from server");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (data === "[DONE]") return;
      try {
        const parsed = JSON.parse(data) as { text?: string; error?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.text) onChunk(parsed.text);
      } catch (e) {
        // re-throw real errors, skip JSON parse failures
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}
