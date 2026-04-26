import type { FlowUsage } from "./specFilesApi";
import { getProjectHeaders } from "./projectHeader";

export interface FlowXmlResult {
  xml: string;
  usage: FlowUsage | null;
}

/** Strip markdown code fences, preamble commentary, and whitespace from AI XML output. */
function cleanXml(raw: string): string {
  let xml = raw
    .replace(/^```(?:xml)?\s*\n?/, "")
    .replace(/\n?```\s*$/, "")
    .trim();
  // Strip any commentary before the XML declaration
  const xmlStart = xml.indexOf("<?xml");
  if (xmlStart > 0) xml = xml.slice(xmlStart);
  return xml;
}

/** Generate flow XML (non-streaming). Returns the XML string and usage data.
 *  When ideaId + versionFolder are provided, the server resolves spec files
 *  from the idea's steps — no need to send specFiles from the client.
 */
export async function generateFlowXml(
  prompt: string,
  specFiles: string[],
  model?: string,
  signal?: AbortSignal,
  ideaId?: string,
  versionFolder?: string,
  folderPath?: string,
): Promise<FlowXmlResult> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
    body: JSON.stringify({
      prompt,
      ...(ideaId && versionFolder
        ? { ideaId, versionFolder, ...(folderPath ? { folderPath } : {}) }
        : { specFiles }),
      stream: false,
      ...(model ? { model } : {}),
    }),
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

  const data = await res.json() as { xml: string; usage?: FlowUsage; warning?: string; failedFiles?: string[]; _debug?: unknown };
  if (data._debug) console.log("[FlowGen] Backend debug:", data._debug);
  if (data.warning) console.warn("[FlowGen] Warning:", data.warning, data.failedFiles);
  return { xml: cleanXml(data.xml), usage: data.usage ?? null };
}

/** Edit an existing flow XML using AI. Returns updated XML and usage data. */
export async function editFlowXml(
  xml: string,
  prompt: string,
  model?: string,
  signal?: AbortSignal,
  versionFolder?: string,
  method?: string,
  path?: string,
): Promise<FlowXmlResult> {
  const res = await fetch(`/api/edit-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
    body: JSON.stringify({
      xml, prompt,
      ...(model ? { model } : {}),
      ...(versionFolder ? { versionFolder } : {}),
      ...(method ? { method } : {}),
      ...(path ? { path } : {}),
    }),
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
  return { xml: cleanXml(data.xml), usage: data.usage ?? null };
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

/** Stream flow XML from Claude via SSE. Calls onChunk for each text delta.
 *  If onCorrected is provided, it receives the post-processed XML after streaming completes.
 */
export async function generateFlowStream(
  prompt: string,
  specFiles: string[],
  onChunk: (text: string) => void,
  model?: string,
  signal?: AbortSignal,
  onCorrected?: (xml: string) => void,
): Promise<void> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
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
        const parsed = JSON.parse(data) as { text?: string; error?: string; corrected?: string };
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.corrected && onCorrected) onCorrected(parsed.corrected);
        else if (parsed.text) onChunk(parsed.text);
      } catch (e) {
        // re-throw real errors, skip JSON parse failures
        if (e instanceof SyntaxError) continue;
        throw e;
      }
    }
  }
}
