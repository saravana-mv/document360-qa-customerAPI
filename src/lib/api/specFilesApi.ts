import { tryGetProjectHeaders } from "./projectHeader";

export interface SpecFileItem {
  name: string;
  size: number;
  lastModified: string;
  contentType: string;
  httpMethod?: string;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  // Inject project header so audit log entries are tagged with the correct projectId
  const projectHeaders = tryGetProjectHeaders();
  const merged: RequestInit = {
    ...init,
    headers: { ...projectHeaders, ...init?.headers },
  };
  const res = await fetch(url, merged);
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

// ── Version History ──────────────────────────────────────────────────────────

export interface SkillsVersion {
  name: string;      // blob path for fetching content
  timestamp: string;  // ISO timestamp
  size: number;
}

export async function listSkillsVersions(name: string): Promise<SkillsVersion[]> {
  const res = await apiFetch(`/api/spec-files/versions?name=${encodeURIComponent(name)}`);
  return res.json() as Promise<SkillsVersion[]>;
}

// ── Swagger Split ────────────────────────────────────────────────────────────

export interface SuggestedVariable {
  name: string;
  description: string;
  type: string;
  format?: string;
  example?: string;
}

export type SuggestedConnectionProvider = "oauth2" | "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie";

export interface SuggestedConnection {
  name: string;
  provider: SuggestedConnectionProvider;
  description?: string;
  baseUrl?: string;
  apiVersion?: string;
  authorizationUrl?: string;
  tokenUrl?: string;
  scopes?: string;
  authHeaderName?: string;
  authQueryParam?: string;
}

export interface ProcessingReport {
  distillation: {
    total: number;
    distilled: number;
    unchanged: number;
    errors: number;
    errorDetails: Array<{ file: string; error: string }>;
  };
  digest: {
    built: boolean;
    error?: string;
  };
}

export interface SplitSwaggerResult {
  files: string[];
  stats: { endpoints: number; folders: number; skipped: number };
  suggestedVariables?: SuggestedVariable[];
  suggestedConnections?: SuggestedConnection[];
  processing?: ProcessingReport;
}

export async function splitSwagger(
  folderPath: string,
  options?: { specUrl?: string; overwrite?: boolean },
): Promise<SplitSwaggerResult> {
  const res = await apiFetch("/api/spec-files/split-swagger", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderPath,
      ...(options?.specUrl ? { specUrl: options.specUrl } : {}),
      ...(options?.overwrite ? { overwrite: options.overwrite } : {}),
    }),
  });
  return res.json() as Promise<SplitSwaggerResult>;
}

// ── Reimport Spec ─────────────────────────────────────────────────────────────

export async function reimportSpec(
  folderPath: string,
  specContent?: string,
  specUrl?: string,
): Promise<SplitSwaggerResult & { wiped?: Record<string, number> }> {
  const res = await apiFetch("/api/spec-files/reimport", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderPath,
      ...(specContent != null ? { specContent } : {}),
      ...(specUrl ? { specUrl } : {}),
    }),
  });
  return res.json() as Promise<SplitSwaggerResult & { wiped?: Record<string, number> }>;
}

// ── Regenerate System Files ───────────────────────────────────────────────────

export interface RegenerateSystemResult {
  distillation: {
    total: number;
    distilled: number;
    unchanged: number;
    errors: number;
    errorDetails: Array<{ file: string; error: string }>;
  };
  digest: { built: boolean; error?: string };
  dependencies: { built: boolean; error?: string };
}

export async function regenerateSystemFiles(
  folderPath: string,
): Promise<RegenerateSystemResult> {
  const res = await apiFetch("/api/spec-files/regenerate-system", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folderPath }),
  });
  return res.json() as Promise<RegenerateSystemResult>;
}

// ── Skills Chat (AI) ──────────────────────────────────────────────────────────

export interface SkillsChatResponse {
  updatedContent: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; costUsd: number };
}

export async function sendSkillsChat(
  currentContent: string,
  instruction: string,
  model?: string,
): Promise<SkillsChatResponse> {
  const res = await apiFetch("/api/skills-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currentContent, instruction, ...(model ? { model } : {}) }),
  });
  return res.json() as Promise<SkillsChatResponse>;
}

// ── Full-Text Search ─────────────────────────────────────────────────────────

export interface SpecSearchResult {
  name: string;
  matches: string[];
  score: number;
}

export async function searchSpecFiles(query: string, version?: string): Promise<SpecSearchResult[]> {
  const params = new URLSearchParams({ q: query });
  if (version) params.set("version", version);
  const res = await apiFetch(`/api/spec-files/search?${params.toString()}`);
  return res.json() as Promise<SpecSearchResult[]>;
}

// ── Flow Ideas (AI) ───────────────────────────────────────────────────────────

export type IdeaMode = "full" | "no-prereqs" | "no-prereqs-no-teardown";

export interface FlowIdea {
  id: string;
  title: string;
  description: string;
  steps: string[];
  entities: string[];
  complexity: "simple" | "moderate" | "complex";
  specFiles?: string[];
  mode?: IdeaMode;
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
  traceId?: string;
}

export type IdeaScope = "folder" | "version" | "custom";

export async function generateFlowIdeas(
  folderPath: string,
  existingIdeas?: string[],
  maxBudgetUsd?: number,
  model?: string,
  maxCount?: number,
  filePaths?: string[],
  mode?: IdeaMode,
  prompt?: string,
  scope?: IdeaScope,
): Promise<GenerateFlowIdeasResponse> {
  const res = await apiFetch("/api/generate-flow-ideas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderPath,
      existingIdeas,
      maxBudgetUsd,
      ...(model ? { model } : {}),
      ...(maxCount ? { maxCount } : {}),
      ...(filePaths && filePaths.length > 0 ? { filePaths } : {}),
      ...(mode ? { mode } : {}),
      ...(prompt ? { prompt } : {}),
      ...(scope && scope !== "folder" ? { scope } : {}),
    }),
  });
  return res.json() as Promise<GenerateFlowIdeasResponse>;
}
