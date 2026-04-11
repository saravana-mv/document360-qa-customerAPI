/** Generate flow XML (non-streaming). Returns the full XML string. */
export async function generateFlowXml(
  prompt: string,
  specFiles: string[],
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(`/api/generate-flow`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, specFiles, stream: false }),
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

  const data = await res.json() as { xml: string };
  return data.xml;
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
