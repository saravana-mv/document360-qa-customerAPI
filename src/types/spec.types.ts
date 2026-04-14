export interface SwaggerSpec {
  openapi: string;
  info: { title: string; version: string };
  paths: Record<string, PathItem>;
  tags?: TagObject[];
}

export interface TagObject {
  name: string;
  description?: string;
}

export interface PathItem {
  get?: Operation;
  post?: Operation;
  put?: Operation;
  patch?: Operation;
  delete?: Operation;
  [key: string]: Operation | undefined;
}

export interface Operation {
  operationId?: string;
  summary?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: Schema;
}

export interface RequestBody {
  required?: boolean;
  content?: Record<string, { schema?: Schema }>;
}

export interface Response {
  description?: string;
  content?: Record<string, { schema?: Schema }>;
}

export interface Schema {
  type?: string;
  properties?: Record<string, Schema>;
  items?: Schema;
  $ref?: string;
}

export interface ParsedTag {
  name: string;
  endpoints: ParsedEndpoint[];
}

export interface ParsedEndpoint {
  path: string;
  method: string;
  operation: Operation;
  operationId: string;
  summary: string;
  tags: string[];
}

export interface SpecFingerprint {
  hash: string;
  timestamp: number;
  operationCount: number;
}

export interface SpecDiff {
  added: ParsedEndpoint[];
  removed: ParsedEndpoint[];
  changed: ChangedEndpoint[];
}

export interface ChangedEndpoint {
  path: string;
  method: string;
  changes: string[];
}

// ── URL-sourced spec file metadata ──────────────────────────────────────────

export interface SourceEntry {
  sourceUrl: string;
  importedAt: string;
  lastSyncedAt: string | null;
}

export type SourcesManifest = Record<string, SourceEntry>;
