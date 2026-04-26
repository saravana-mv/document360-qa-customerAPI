/**
 * Unified AI context builder — loads spec context, API rules, project variables,
 * and dependency info into a single object that any AI function can use.
 *
 * Replaces the copy-paste pattern where each AI function independently loads
 * rules, variables, and specs.
 */

import { listBlobs, downloadBlob } from "./blobClient";
import { loadApiRules, injectApiRules, extractVersionFolder } from "./apiRules";
import { loadProjectVariables, injectProjectVariables } from "./projectVariables";
import { loadOrRebuildDependencies } from "./specDependencies";
import { readDistilledContent } from "./specDistillCache";

// ── Types ──────────────────────────────────────────────────────────────

export interface AiContextOptions {
  projectId: string;
  versionFolder?: string | null;
  /** Multi-file spec loading (generateFlow, flowChat) */
  specFiles?: string[];
  /** Single-endpoint lookup (editFlow fix-it, debugAnalyze) */
  endpointHint?: { method: string; path: string };
  /** What to load (all default true) */
  loadRules?: boolean;
  loadVariables?: boolean;
  loadDependencies?: boolean;
  loadSpec?: boolean;
}

export interface AiContext {
  rules: string;
  enumAliases: string;
  projectVariables: { name: string; value: string }[];
  dependencyInfo: string | null;
  specContext: string;
  specSource: "distilled" | "raw" | "none";
  /** Chain all injections onto a base system prompt */
  enrichSystemPrompt(basePrompt: string): string;
  /** Format spec + deps for user message injection */
  formatUserContext(): string;
}

// ── Constants ──────────────────────────────────────────────────────────

const MAX_SPEC_SCAN = 50;

// ── Spec lookup by method+path (moved from debugAnalyze.ts) ──────────

/**
 * Try to find the matching spec for a given method + path.
 * First tries distilled content (compact), then falls back to raw spec.
 */
export async function findMatchingSpec(
  projectId: string,
  method: string,
  path: string,
): Promise<{ content: string; source: "distilled" | "raw" } | null> {
  const versionMatch = path.match(/^\/(v\d+)\//i);
  if (!versionMatch) return null;

  const versionFolder = versionMatch[1].toUpperCase();
  const prefix = projectId !== "unknown" ? `${projectId}/${versionFolder}/` : `${versionFolder}/`;

  try {
    const blobs = await listBlobs(prefix);
    const mdBlobs = blobs
      .filter((b) => b.name.endsWith(".md") && !b.name.includes("_digest") && !b.name.includes("_distilled/") && !b.name.includes("/_system/"))
      .slice(0, MAX_SPEC_SCAN);

    const methodUpper = method.toUpperCase();
    const methodMatches = mdBlobs.filter((b) => b.httpMethod === methodUpper);

    const pathWithoutVersion = path.replace(/^\/v\d+/i, "");
    const pathPattern = path.replace(/\{[^}]+\}/g, "{*}");
    const pathPatternWithoutVersion = pathWithoutVersion.replace(/\{[^}]+\}/g, "{*}");

    const searchBlobs = methodMatches.length > 0 ? methodMatches : mdBlobs;

    for (const blob of searchBlobs) {
      try {
        const content = await readDistilledContent(blob.name);
        const contentUpper = content.toUpperCase();

        const patterns = [
          `${methodUpper} ${path}`,
          `${methodUpper} ${pathWithoutVersion}`,
          `${methodUpper} /${versionFolder.toLowerCase()}${pathWithoutVersion}`,
        ];

        if (patterns.some((p) => contentUpper.includes(p.toUpperCase()))) {
          return { content, source: "distilled" };
        }

        const normalizedContent = content.replace(/\{[^}]+\}/g, "{*}").toUpperCase();
        if (normalizedContent.includes(`${methodUpper} ${pathPattern}`.toUpperCase()) ||
            normalizedContent.includes(`${methodUpper} ${pathPatternWithoutVersion}`.toUpperCase())) {
          return { content, source: "distilled" };
        }
      } catch {
        // Skip unreadable blobs
      }
    }

    // Fallback: raw spec files
    for (const blob of searchBlobs) {
      try {
        const raw = await downloadBlob(blob.name);
        const rawUpper = raw.toUpperCase();
        const normalizedRaw = raw.replace(/\{[^}]+\}/g, "{*}").toUpperCase();

        const patterns = [
          `${methodUpper} ${path}`,
          `${methodUpper} ${pathWithoutVersion}`,
        ];

        if (patterns.some((p) => rawUpper.includes(p.toUpperCase())) ||
            normalizedRaw.includes(`${methodUpper} ${pathPattern}`.toUpperCase())) {
          return { content: raw, source: "raw" };
        }
      } catch {
        // Skip
      }
    }
  } catch {
    // Blob listing failed
  }

  return null;
}

// ── Main context loader ────────────────────────────────────────────────

/**
 * Load all AI context for a given project + version folder.
 * Each piece is independently optional — callers pick what they need.
 */
export async function loadAiContext(opts: AiContextOptions): Promise<AiContext> {
  const {
    projectId,
    specFiles,
    endpointHint,
    loadRules: doRules = true,
    loadVariables: doVars = true,
    loadDependencies: doDeps = true,
    loadSpec: doSpec = true,
  } = opts;

  // Derive version folder if not provided
  let versionFolder = opts.versionFolder ?? null;
  if (!versionFolder && specFiles?.length) {
    versionFolder = extractVersionFolder(specFiles);
  }
  if (!versionFolder && endpointHint) {
    const vm = endpointHint.path.match(/^\/(v\d+)\//i);
    if (vm) versionFolder = vm[1].toUpperCase();
  }

  // Load rules + enum aliases
  let rules = "";
  let enumAliases = "";
  if (doRules && projectId !== "unknown") {
    try {
      const loaded = await loadApiRules(projectId, versionFolder ?? undefined);
      rules = loaded.rules;
      enumAliases = loaded.enumAliases;
    } catch { /* ignore */ }
  }

  // Load project variables
  let projectVariables: { name: string; value: string }[] = [];
  if (doVars) {
    projectVariables = await loadProjectVariables(projectId);
  }

  // Load dependency info
  let dependencyInfo: string | null = null;
  if (doDeps && versionFolder) {
    dependencyInfo = await loadOrRebuildDependencies(projectId, versionFolder);
  }

  // Load spec context
  let specContext = "";
  let specSource: "distilled" | "raw" | "none" = "none";

  if (doSpec && endpointHint) {
    const match = await findMatchingSpec(projectId, endpointHint.method, endpointHint.path);
    if (match) {
      specContext = match.content;
      specSource = match.source;
    }
  }
  // Note: specFiles-based loading is NOT handled here — generateFlow/flowChat
  // have their own buildSpecContext with truncation, digest fallback, etc.
  // This module handles endpoint-hint lookups only (editFlow fix-it, debugAnalyze).

  return {
    rules,
    enumAliases,
    projectVariables,
    dependencyInfo,
    specContext,
    specSource,

    enrichSystemPrompt(basePrompt: string): string {
      let prompt = basePrompt;
      prompt = injectApiRules(prompt, rules);
      prompt = injectProjectVariables(prompt, projectVariables);
      if (dependencyInfo) {
        prompt += `\n\n${dependencyInfo}`;
      }
      return prompt;
    },

    formatUserContext(): string {
      const parts: string[] = [];
      if (specContext) {
        parts.push(`## Endpoint Specification (source: ${specSource})\n\n${specContext}`);
      }
      if (dependencyInfo) {
        parts.push(dependencyInfo);
      }
      return parts.join("\n\n");
    },
  };
}
