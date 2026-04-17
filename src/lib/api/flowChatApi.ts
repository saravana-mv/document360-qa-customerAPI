import type { FlowUsage } from "./specFilesApi";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  plan?: FlowPlan | null;
  timestamp: number;
}

export interface FlowPlanStep {
  number: number;
  name: string;
  method: string;
  path: string;
  captures: string[];
  assertions: string[];
  flags: string[];
}

export interface FlowPlan {
  name: string;
  entity: string;
  description: string;
  steps: FlowPlanStep[];
}

export interface FlowChatResponse {
  reply: string;
  usage: FlowUsage;
}

/** Parse a ```flowplan JSON block from the AI response */
export function parsePlanFromReply(reply: string): FlowPlan | null {
  const match = reply.match(/```flowplan\s*\n([\s\S]*?)\n```/);
  if (!match) return null;
  try {
    const plan = JSON.parse(match[1]) as FlowPlan;
    // Basic validation
    if (!plan.name || !plan.steps || !Array.isArray(plan.steps)) return null;
    return plan;
  } catch {
    return null;
  }
}

/** Check if the AI's reply indicates the user confirmed the plan */
export function isConfirmation(reply: string): boolean {
  return reply.includes("CONFIRMED:");
}

/** Send a message in the flow chat conversation */
export async function sendFlowChatMessage(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  specFiles: string[],
  model?: string,
  signal?: AbortSignal,
): Promise<FlowChatResponse> {
  const res = await fetch("/api/flow-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, specFiles, ...(model ? { model } : {}) }),
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

  return res.json() as Promise<FlowChatResponse>;
}
