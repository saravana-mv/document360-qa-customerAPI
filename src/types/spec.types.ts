export interface SwaggerSpec {
  openapi: string;
  info: { title: string; version: string; description?: string };
  paths: Record<string, PathItem>;
  tags?: TagObject[];
  components?: { schemas?: Record<string, Schema>; securitySchemes?: Record<string, SecurityScheme> };
  security?: Array<Record<string, string[]>>;
  servers?: Array<{ url: string; description?: string }>;
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
  description?: string;
  tags?: string[];
  parameters?: Parameter[];
  requestBody?: RequestBody;
  responses?: Record<string, Response>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

export interface Parameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required?: boolean;
  schema?: Schema;
  description?: string;
  example?: unknown;
  $ref?: string;
}

export interface RequestBody {
  required?: boolean;
  description?: string;
  content?: Record<string, { schema?: Schema; example?: unknown }>;
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
  description?: string;
  example?: unknown;
  format?: string;
  enum?: (string | number)[];
  required?: string[];
  allOf?: Schema[];
  oneOf?: Schema[];
  anyOf?: Schema[];
  nullable?: boolean;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  readOnly?: boolean;
  writeOnly?: boolean;
  deprecated?: boolean;
  title?: string;
  additionalProperties?: boolean | Schema;
}

export interface SecurityScheme {
  type: string;
  scheme?: string;
  bearerFormat?: string;
  name?: string;
  in?: string;
  flows?: Record<string, { authorizationUrl?: string; tokenUrl?: string; scopes?: Record<string, string> }>;
  description?: string;
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
