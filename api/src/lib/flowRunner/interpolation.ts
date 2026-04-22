// Pure interpolation and path-resolution helpers for the server-side runner.
// Ported from src/lib/tests/flowXml/builder.ts — zero browser dependencies.

import type { RunContext } from "./types";

/** Mutable state bag shared across steps within a single scenario run. */
export type RunState = Record<string, unknown>;

// ── Enum aliases (D360 returns integers, specs use strings) ─────────────────

interface EnumEntry {
  name: string;
  value: number;
}

const ENUM_ALIASES: EnumEntry[] = [
  { name: "draft", value: 0 },
  { name: "new", value: 1 },
  { name: "updated", value: 2 },
  { name: "published", value: 3 },
  { name: "forked", value: 4 },
  { name: "unpublished", value: 5 },
  { name: "folder", value: 0 },
  { name: "page", value: 1 },
  { name: "index", value: 2 },
  { name: "markdown", value: 0 },
  { name: "wysiwyg", value: 1 },
  { name: "block", value: 2 },
  { name: "raw", value: 0 },
  { name: "display", value: 1 },
  { name: "public", value: 0 },
  { name: "protected", value: 1 },
  { name: "mixed", value: 2 },
];

const byName = new Map<string, number[]>();
for (const { name, value } of ENUM_ALIASES) {
  const lower = name.toLowerCase();
  if (!byName.has(lower)) byName.set(lower, []);
  byName.get(lower)!.push(value);
}

export function enumMatches(name: string, value: number): boolean {
  const matches = byName.get(name.toLowerCase());
  return matches ? matches.includes(value) : false;
}

// ── Path rewriting ──────────────────────────────────────────────────────────

export function rewriteApiVersion(path: string, apiVersion: string): string {
  return path.replace(/^\/v\d+(?=\/)/, `/${apiVersion}`);
}

// ── Dot-path traversal ──────────────────────────────────────────────────────

export function readDotPath(obj: unknown, path: string): unknown {
  const parts: string[] = [];
  for (const segment of path.split(".")) {
    const bracketMatch = segment.match(/^([^[]*)\[(\d+)]$/);
    if (bracketMatch) {
      if (bracketMatch[1]) parts.push(bracketMatch[1]);
      parts.push(bracketMatch[2]);
    } else {
      parts.push(segment);
    }
  }
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isNaN(idx) ? undefined : cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

export function readPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

export function fieldExists(obj: unknown, path: string): boolean {
  if (obj === null || obj === undefined) return false;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return false;
    if (!(p in (cur as Record<string, unknown>))) return false;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur !== undefined;
}

// ── Template interpolation ──────────────────────────────────────────────────

function resolveCtx(name: string, ctx: RunContext): unknown {
  if (name === "projectId") return ctx.projectId;
  if (name === "versionId") return ctx.versionId;
  if (name === "langCode") return ctx.langCode;
  if (name === "apiVersion") return ctx.apiVersion;
  return undefined;
}

function resolveExpr(expr: string, ctx: RunContext, state: RunState): unknown {
  if (expr === "timestamp") return Date.now();
  if (expr.startsWith("ctx.")) return resolveCtx(expr.slice("ctx.".length), ctx);
  if (expr.startsWith("state.")) {
    const key = expr.slice("state.".length);
    if (key.includes(".")) return readDotPath(state, key);
    return state[key];
  }
  if (expr.startsWith("proj.")) {
    const key = expr.slice("proj.".length);
    return ctx.projectVariables?.[key];
  }
  return undefined;
}

function escapeForJsonString(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

/**
 * Replace {{expr}} placeholders in a template string.
 */
export function substitute(template: string, ctx: RunContext, state: RunState): string {
  return template.replace(/\{\{(!?)([a-zA-Z][a-zA-Z0-9._]*)\}\}/g, (_match, neg, expr) => {
    let value = resolveExpr(expr, ctx, state);
    if (neg) value = !value;
    if (typeof value === "string") return escapeForJsonString(value);
    if (value === undefined) return "null";
    return JSON.stringify(value);
  });
}

/**
 * Resolve a single param value (path/query).
 */
export function resolveParam(raw: string, ctx: RunContext, state: RunState): unknown {
  const trimmed = raw.trim();
  if (trimmed.startsWith("ctx.")) return resolveCtx(trimmed.slice("ctx.".length), ctx);
  if (trimmed.startsWith("state.")) return state[trimmed.slice("state.".length)];
  if (trimmed.startsWith("proj.")) return ctx.projectVariables?.[trimmed.slice("proj.".length)];
  if (trimmed.includes("{{")) {
    const out = substitute(trimmed, ctx, state);
    return tryParseJson(out);
  }
  return trimmed;
}

function tryParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// ── JSON comparison (with enum alias support) ───────────────────────────────

export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "string") {
    if (String(a) === b) return true;
    if (enumMatches(b, a)) return true;
  }
  if (typeof a === "string" && typeof b === "number") {
    if (a === String(b)) return true;
    if (enumMatches(a, b)) return true;
  }
  return false;
}

export function coerce(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
