export interface SpecFileItem {
  name: string;
  size: number;
  lastModified: string;
  contentType: string;
  httpMethod?: string;
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

// ── URL Import & Sync ─────────────────────────────────────────────────────────

import type { SourceEntry } from "../../types/spec.types";

export interface ImportFromUrlResult {
  name: string;
  filename: string;
  uploaded: boolean;
  sourceUrl: string;
}

export async function importSpecFileFromUrl(
  url: string,
  folderPath: string,
  filename?: string,
  accessToken?: string,
  content?: string,
): Promise<ImportFromUrlResult> {
  const res = await apiFetch("/api/spec-files/import-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      folderPath,
      ...(filename ? { filename } : {}),
      ...(accessToken ? { accessToken } : {}),
      ...(content != null ? { content } : {}),
    }),
  });
  return res.json() as Promise<ImportFromUrlResult>;
}

export interface SyncResult {
  synced: Array<{ name: string; updated: boolean; error?: string }>;
  message?: string;
}

export async function syncSpecFiles(
  folderPath: string,
  filename?: string,
  accessToken?: string,
): Promise<SyncResult> {
  const res = await apiFetch("/api/spec-files/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath, ...(filename ? { filename } : {}), ...(accessToken ? { accessToken } : {}) }),
  });
  return res.json() as Promise<SyncResult>;
}

export async function getSourcesManifest(
  prefix?: string,
): Promise<Record<string, SourceEntry>> {
  const url = prefix
    ? `/api/spec-files/sources?prefix=${encodeURIComponent(prefix)}`
    : `/api/spec-files/sources`;
  const res = await apiFetch(url);
  return res.json() as Promise<Record<string, SourceEntry>>;
}

export async function updateSourceUrl(
  filePath: string,
  sourceUrl: string,
): Promise<void> {
  await apiFetch("/api/spec-files/sources", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filePath, sourceUrl }),
  });
}

// ── Flow Ideas (AI) ───────────────────────────────────────────────────────────

export interface FlowIdea {
  id: string;
  title: string;
  description: string;
  steps: string[];
  entities: string[];
  complexity: "simple" | "moderate" | "complex";
  costUsd?: number;
  createdAt?: string;
}

export interface FlowIdeasUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  filesAnalyzed: number;
  totalSpecCharacters: number;
}

export interface FlowUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export interface GenerateFlowIdeasResponse {
  ideas: FlowIdea[];
  usage: FlowIdeasUsage;
  rawText?: string;
  parseError?: boolean;
  message?: string;
}

export async function generateFlowIdeas(
  folderPath: string,
  existingIdeas?: string[],
  maxBudgetUsd?: number,
  model?: string,
  maxCount?: number
): Promise<GenerateFlowIdeasResponse> {
  const res = await apiFetch("/api/generate-flow-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath, existingIdeas, maxBudgetUsd, ...(model ? { model } : {}), ...(maxCount ? { maxCount } : {}) }),
  });
  return res.json() as Promise<GenerateFlowIdeasResponse>;
}
