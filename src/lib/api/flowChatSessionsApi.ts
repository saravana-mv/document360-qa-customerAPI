import { getProjectHeaders } from "./projectHeader";

export interface ChatSessionSummary {
  id: string;
  title: string;
  totalCost: number;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
}

export interface ChatSessionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  plan?: unknown;
}

export interface ChatSessionFull {
  id: string;
  projectId: string;
  type: "flow_chat_session";
  userId: string;
  title: string;
  messages: ChatSessionMessage[];
  confirmedPlan: unknown | null;
  totalCost: number;
  specFiles: string[];
  createdAt: string;
  updatedAt: string;
  createdBy: { oid: string; name: string };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getProjectHeaders(),
    ...(init?.headers as Record<string, string> ?? {}),
  };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** List chat sessions for current user (most recent first) */
export async function listChatSessions(): Promise<ChatSessionSummary[]> {
  return apiFetch<ChatSessionSummary[]>("/api/flow-chat-sessions");
}

/** Get full session by ID */
export async function getChatSession(id: string): Promise<ChatSessionFull> {
  return apiFetch<ChatSessionFull>(`/api/flow-chat-sessions?id=${encodeURIComponent(id)}`);
}

/** Create a new session */
export async function createChatSession(session: {
  id: string;
  title: string;
  messages: ChatSessionMessage[];
  confirmedPlan?: unknown;
  totalCost?: number;
  specFiles?: string[];
}): Promise<ChatSessionFull> {
  return apiFetch<ChatSessionFull>("/api/flow-chat-sessions", {
    method: "POST",
    body: JSON.stringify(session),
  });
}

/** Update an existing session (fire-and-forget friendly) */
export async function updateChatSession(update: {
  id: string;
  title?: string;
  messages?: ChatSessionMessage[];
  confirmedPlan?: unknown;
  totalCost?: number;
  specFiles?: string[];
}): Promise<void> {
  await apiFetch<unknown>("/api/flow-chat-sessions", {
    method: "PUT",
    body: JSON.stringify(update),
  });
}

/** Delete a session */
export async function deleteChatSession(id: string): Promise<void> {
  await apiFetch<unknown>(`/api/flow-chat-sessions?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
