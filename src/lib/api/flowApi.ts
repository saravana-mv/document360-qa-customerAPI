import type { FlowUsage } from "./specFilesApi";

export interface FlowXmlResult {
  xml: string;
  usage: FlowUsage | null;
}

/** Generate flow XML (non-streaming). Returns the XML string and usage data. */
export async function generateFlowXml(
  prompt: string,
  specFiles: string[],
  model?: string,
  signal?: AbortSignal
): Promise<FlowXmlResult> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, specFiles, stream: false, ...(model ? { model } : {}) }),
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

  const data = await res.json() as { xml: string; usage?: FlowUsage };
  return { xml: data.xml, usage: data.usage ?? null };
}

/** Edit an existing flow XML using AI. Returns updated XML and usage data. */
export async function editFlowXml(
  xml: string,
  prompt: string,
  model?: string,
  signal?: AbortSignal
): Promise<FlowXmlResult> {
  const res = await fetch(`/api/edit-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ xml, prompt, ...(model ? { model } : {}) }),
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

  const data = await res.json() as { xml: string; usage?: FlowUsage };
  return { xml: data.xml, usage: data.usage ?? null };
}

/** Generate a short descriptive title for a flow prompt using AI (Haiku). */
export async function generateTitle(
  prompt: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`/api/generate-title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
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

  const data = await res.json() as { title: string };
  return data.title;
}

/** Stream flow XML from Claude via SSE. Calls onChunk for each text delta. */
export async function generateFlowStream(
  prompt: string,
  specFiles: string[],
  onChunk: (text: string) => void,
  model?: string,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, specFiles, stream: true, ...(model ? { model } : {}) }),
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
