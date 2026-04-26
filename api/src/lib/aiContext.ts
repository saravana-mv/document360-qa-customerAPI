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
import { parseFlowXml } from "./flowRunner/parser";

// ── Types ──────────────────────────────────────────────────────────────

export interface AiContextOptions {
  projectId: string;
  versionFolder?: string | null;
  /** Multi-file spec loading (generateFlow, flowChat) */
  specFiles?: string[];
  /** Single-endpoint lookup (editFlow fix-it, debugAnalyze) */
  endpointHint?: { method: string; path: string };
  /**
   * Flow XML string — when provided, loads specs for ALL steps in the flow.
   * This gives the AI cross-step awareness: it can see what fields prior steps
   * return (for captures) and what fields later steps require (for dependencies).
   */
  flowXml?: string;
  /** What to load (all default true) */
  loadRules?: boolean;
  loadVariables?: boolean;
  loadDependencies?: boolean;
  loadSpec?: boolean;
}

/** Spec loaded for one step in a multi-step flow */
export interface StepSpec {
  stepNumber: number;
  name: string;
  method: string;
  path: string;
  spec: string | null;
  specSource: "distilled" | "raw" | "none";
}

export interface AiContext {
  rules: string;
  enumAliases: string;
  projectVariables: { name: string; value: string }[];
  dependencyInfo: string | null;
  specContext: string;
  specSource: "distilled" | "raw" | "none";
  /** Specs for ALL steps in the flow (when flowXml was provided) */
  flowStepSpecs: StepSpec[];
  /** Chain all injections onto a base system prompt */
  enrichSystemPrompt(basePrompt: string): string;
  /** Format spec + deps for user message injection */
  formatUserContext(): string;
  /** Format all flow step specs as context (for diagnosis/fix-it) */
  formatFlowStepSpecs(failingStepNumber?: number): string;
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

// ── Multi-step spec loading ─────────────────────────────────────────────

/** Normalize path for comparison (strip version, lowercase, wildcard params). */
function normalizePath(p: string): string {
  return p.replace(/^\/v\d+/i, "").replace(/\{[^}]+\}/g, "{*}").toLowerCase();
}

/**
 * Parse flow XML and load specs for every unique step endpoint.
 * Deduplicates by method+path so the same endpoint isn't loaded twice.
 */
async function loadFlowStepSpecs(
  projectId: string,
  flowXml: string,
): Promise<StepSpec[]> {
  let parsed;
  try {
    parsed = parseFlowXml(flowXml);
  } catch {
    return [];
  }

  // Deduplicate by normalized method+path
  const seen = new Map<string, { content: string; source: "distilled" | "raw" } | null>();
  const results: StepSpec[] = [];

  for (const step of parsed.steps) {
    const key = `${step.method.toUpperCase()}:${normalizePath(step.path)}`;

    if (!seen.has(key)) {
      // Load spec for this endpoint
      const match = await findMatchingSpec(projectId, step.method, step.path);
      seen.set(key, match);
    }

    const cached = seen.get(key) ?? null;
    results.push({
      stepNumber: step.number,
      name: step.name,
      method: step.method,
      path: step.path,
      spec: cached?.content ?? null,
      specSource: cached?.source ?? "none",
    });
  }

  return results;
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
  let flowStepSpecs: StepSpec[] = [];

  if (doSpec && opts.flowXml) {
    // Multi-step mode: parse flow XML, load specs for ALL steps
    flowStepSpecs = await loadFlowStepSpecs(projectId, opts.flowXml);
    // Primary spec = the endpointHint step (if provided), otherwise first step with a spec
    if (endpointHint) {
      const match = flowStepSpecs.find(
        s => s.method.toUpperCase() === endpointHint.method.toUpperCase() &&
             normalizePath(s.path) === normalizePath(endpointHint.path),
      );
      if (match?.spec) {
        specContext = match.spec;
        specSource = match.specSource;
      }
    }
    // If endpointHint didn't match, fall back to single-endpoint lookup
    if (!specContext && endpointHint) {
      const match = await findMatchingSpec(projectId, endpointHint.method, endpointHint.path);
      if (match) {
        specContext = match.content;
        specSource = match.source;
      }
    }
  } else if (doSpec && endpointHint) {
    // Single-endpoint mode (backward compatible)
    const match = await findMatchingSpec(projectId, endpointHint.method, endpointHint.path);
    if (match) {
      specContext = match.content;
      specSource = match.source;
    }
  }
  // Note: specFiles-based loading is NOT handled here — generateFlow/flowChat
  // have their own buildSpecContext with truncation, digest fallback, etc.

  return {
    rules,
    enumAliases,
    projectVariables,
    dependencyInfo,
    specContext,
    specSource,
    flowStepSpecs,

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

    formatFlowStepSpecs(failingStepNumber?: number): string {
      if (flowStepSpecs.length === 0) return "";
      const sections: string[] = [];
      sections.push("## API Specifications for All Flow Steps\n");
      sections.push("Use these specs to understand what each step sends, what it returns, and what fields are available for capture.\n");
      for (const ss of flowStepSpecs) {
        const isFailing = failingStepNumber !== undefined && ss.stepNumber === failingStepNumber;
        const label = isFailing ? " ← FAILING STEP" : "";
        if (ss.spec) {
          sections.push(`### Step ${ss.stepNumber}: ${ss.method} ${ss.path}${label}\n\n${ss.spec}`);
        } else {
          sections.push(`### Step ${ss.stepNumber}: ${ss.method} ${ss.path}${label}\n\n(Spec not available)`);
        }
      }
      return sections.join("\n\n");
    },
  };
}
