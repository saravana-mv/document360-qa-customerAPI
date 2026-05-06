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

// Cap on how many spec MD blobs `findMatchingSpec` examines per lookup. Set
// well above realistic per-version-folder spec counts (Document360 has ~200
// endpoints) so debug/fix-it doesn't silently miss specs that exist beyond
// position 50 in the blob listing.
const MAX_SPEC_SCAN = 500;

function stripProjectPrefix(blobName: string, projectId: string): string {
  const prefix = projectId !== "unknown" ? `${projectId}/` : "";
  return prefix && blobName.startsWith(prefix) ? blobName.slice(prefix.length) : blobName;
}

// ── Spec lookup by method+path (moved from debugAnalyze.ts) ──────────

/**
 * Try to find the matching spec for a given method + path.
 * First tries distilled content (compact), then falls back to raw spec.
 */
export async function findMatchingSpec(
  projectId: string,
  method: string,
  path: string,
): Promise<{ content: string; source: "distilled" | "raw"; blobName: string } | null> {
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

    /**
     * End-anchored path match: a substring `POST /v3/articles` would otherwise
     * also match `POST /v3/articles/bulk` (the bulk endpoint), causing
     * findMatchingSpec to return content for the wrong endpoint and
     * downstream validators to flag the correct AI-generated endpointRef as
     * stale. Require the matched path to end on a path boundary — newline,
     * end-of-string, or any non-path char.
     */
    const matchesPath = (haystack: string, methodAndPath: string): boolean => {
      const pat = methodAndPath.toUpperCase();
      let from = 0;
      while (true) {
        const idx = haystack.indexOf(pat, from);
        if (idx < 0) return false;
        const after = haystack.charAt(idx + pat.length);
        // Path boundary: end-of-string, newline, whitespace, or any char that
        // can't legally extend a URL path. Crucially exclude "/" (prefix of a
        // deeper path) and "{" (continuation of a path-param template).
        if (after === "" || /[\s?#"`'<>]/.test(after)) return true;
        from = idx + 1;
      }
    };

    for (const blob of searchBlobs) {
      try {
        const content = await readDistilledContent(blob.name);
        const contentUpper = content.toUpperCase();

        const patterns = [
          `${methodUpper} ${path}`,
          `${methodUpper} ${pathWithoutVersion}`,
          `${methodUpper} /${versionFolder.toLowerCase()}${pathWithoutVersion}`,
        ];

        if (patterns.some((p) => matchesPath(contentUpper, p))) {
          return { content, source: "distilled", blobName: stripProjectPrefix(blob.name, projectId) };
        }

        const normalizedContent = content.replace(/\{[^}]+\}/g, "{*}").toUpperCase();
        if (matchesPath(normalizedContent, `${methodUpper} ${pathPattern}`) ||
            matchesPath(normalizedContent, `${methodUpper} ${pathPatternWithoutVersion}`)) {
          return { content, source: "distilled", blobName: stripProjectPrefix(blob.name, projectId) };
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

        if (patterns.some((p) => matchesPath(rawUpper, p)) ||
            matchesPath(normalizedRaw, `${methodUpper} ${pathPattern}`)) {
          return { content: raw, source: "raw", blobName: stripProjectPrefix(blob.name, projectId) };
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
          // Detect whether the distilled spec includes a "Request Body" section
          const hasRequestBody = /### Request Body/i.test(ss.spec);
          const bodyNote = hasRequestBody ? "" : "\n\n**⚠ This endpoint has NO request body — it only uses path/query parameters. Do NOT attribute failures to body fields.**";
          sections.push(`### Step ${ss.stepNumber}: ${ss.method} ${ss.path}${label}\n\n${ss.spec}${bodyNote}`);
        } else {
          sections.push(`### Step ${ss.stepNumber}: ${ss.method} ${ss.path}${label}\n\n(Spec not available)`);
        }
      }
      return sections.join("\n\n");
    },
  };
}

// ── Async post-processor: fill missing endpointRefs via blob lookup ──────
//
// `injectEndpointRefs` (sync, in specRequiredFields.ts) only injects endpointRef
// when the matching spec is in the AI's spec context. For cross-resource
// prerequisite steps the AI invents (e.g. "create category" before an article
// flow), the dependent spec isn't in `specContext`, so the post-processor has
// nothing to inject. This async fallback runs AFTER `injectEndpointRefs` and
// per-step calls `findMatchingSpec` to resolve the spec by direct blob lookup.

const STEP_RE_GLOBAL = /<step\b[^>]*>[\s\S]*?<\/step>/g;

function extractFilenameHeaderFromContent(content: string): string | null {
  const m = content.match(/^## ([\w/.-]+\.md)\s*$/m);
  return m ? m[1] : null;
}

/**
 * For every <step> in the XML that lacks an <endpointRef>, look up the spec
 * by method+path via blob storage and inject the ref using the blob's full
 * project-relative path (e.g. "V3/categories/create-category.md"). Steps
 * already carrying an endpointRef are left untouched.
 *
 * Returns the (possibly-modified) XML. No-op when projectId is "unknown".
 */
export async function injectMissingEndpointRefsFromBlobs(
  xml: string,
  projectId: string,
): Promise<string> {
  if (projectId === "unknown") return xml;

  const matches = Array.from(xml.matchAll(STEP_RE_GLOBAL));
  if (matches.length === 0) return xml;

  // Process in reverse to preserve string offsets when splicing.
  let result = xml;
  let injected = 0;
  for (let i = matches.length - 1; i >= 0; i--) {
    const m = matches[i];
    const stepXml = m[0];
    const stepStart = m.index!;
    if (/<endpointRef>/.test(stepXml)) continue;

    const methodMatch = stepXml.match(/<method>(GET|POST|PUT|PATCH|DELETE)<\/method>/i);
    const pathMatch = stepXml.match(/<path>([^<]+)<\/path>/);
    if (!methodMatch || !pathMatch) continue;
    const method = methodMatch[1].toUpperCase();
    const path = pathMatch[1].trim();

    const found = await findMatchingSpec(projectId, method, path);
    if (!found) continue;

    // Prefer the blob's full project-relative path (e.g. "V3/categories/
    // create-category.md") for consistency with refs the AI already produces.
    // Fall back to the bare filename header inside the content if the blob
    // path is unavailable for any reason.
    const refPath = found.blobName || extractFilenameHeaderFromContent(found.content);
    if (!refPath) continue;

    // Insert <endpointRef> immediately after the closing </name> tag, which is
    // where the schema expects it (after <name>, before <method>).
    const insertAfterName = stepXml.replace(
      /(<\/name>)(\s*)/,
      `$1$2<endpointRef>${refPath}</endpointRef>$2`,
    );
    if (insertAfterName !== stepXml) {
      result = result.slice(0, stepStart) + insertAfterName + result.slice(stepStart + stepXml.length);
      injected += 1;
      console.log(`[injectMissingEndpointRefsFromBlobs] step ${method} ${path} → ${refPath}`);
    }
  }
  if (injected > 0) {
    console.log(`[injectMissingEndpointRefsFromBlobs] injected ${injected} endpointRef(s) via blob lookup`);
  }
  return result;
}
