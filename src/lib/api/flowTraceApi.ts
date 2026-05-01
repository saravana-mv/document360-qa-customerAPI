import { getProjectHeaders } from "./projectHeader";

// ── Ideas Trace ───────────────────────────────────────────────────────────────

export interface IdeasTrace {
  id: string;
  projectId: string;
  createdAt: string;
  createdBy: { oid: string; name: string };
  request: {
    folderPath: string;
    mode: string;
    maxCount: number;
    scope: string;
    prompt: string | null;
    filePaths: string[];
    existingIdeasCount: number;
  };
  specContext: {
    source: "explicit" | "single-file" | "folder";
    usedDigest: boolean;
    filesAnalyzed: number;
    totalSpecCharacters: number;
    fileNames: string[];
  };
  prompt: {
    systemPrompt: string;
    userMessage: string;
  };
  model: {
    name: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
  result: {
    ideasGenerated: number;
    parseError: boolean;
    crossFolderAugmented: number;
  };
}

export async function getIdeasTrace(traceId: string): Promise<IdeasTrace | null> {
  const res = await fetch(`/api/flow-traces?traceId=${encodeURIComponent(traceId)}`, {
    headers: getProjectHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<IdeasTrace>;
}

// ── Flow Trace ────────────────────────────────────────────────────────────────

export interface FlowTrace {
  id: string;
  projectId: string;
  createdAt: string;
  createdBy: { oid: string; name: string };

  ideaRef: {
    id: string;
    description: string;
    steps: string[];
    entities: string[];
  } | null;

  specSelection: {
    source: "server" | "client" | "ai-provided";
    totalBlobFiles: number;
    selectedFiles: string[];
    cappedAt: number;
    survivedFiles: string[];
    failedFiles: string[];
  };

  specContextHeaders: string[];

  prompt: {
    systemPrompt: string;
    userMessage: string;
  };

  postProcessing: {
    name: string;
    applied: boolean;
    changes: string[];
    error?: string;
  }[];

  model: {
    name: string;
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  } | null;
}

export async function getFlowTrace(traceId: string): Promise<FlowTrace | null> {
  const res = await fetch(`/api/flow-traces?traceId=${encodeURIComponent(traceId)}`, {
    headers: getProjectHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) return null;
  return res.json() as Promise<FlowTrace>;
}
