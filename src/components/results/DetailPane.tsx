import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { XmlCodeBlock } from "../common/XmlCodeBlock";
import { XmlDiffView } from "../common/XmlDiffView";
import { useRunnerStore } from "../../store/runner.store";
import { useSpecStore } from "../../store/spec.store";
import { useSetupStore } from "../../store/setup.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useProjectVariablesStore } from "../../store/projectVariables.store";
import { getTest } from "../../lib/tests/registry";
import { rewriteApiVersion } from "../../lib/tests/flowXml/builder";
import { getFlowFileContent, saveFlowFile, unlockFlow } from "../../lib/api/flowFilesApi";
import { useUserStore } from "../../store/user.store";
import { editFlowXml } from "../../lib/api/flowApi";
import { useAiCostStore } from "../../store/aiCost.store";
import { validateFlowXml } from "../../lib/tests/flowXml/validate";
import { loadFlowsFromQueue } from "../../lib/tests/flowXml/loader";
import { activateFlow } from "../../lib/tests/flowXml/activeTests";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import type { TestStatus } from "../../types/test.types";
import { analyzeFailure, analyzeFailureByScenario } from "../../lib/api/debugApi";
import type { DebugDiagnosis } from "../../lib/api/debugApi";
import { suggestSimilarVar } from "../../lib/tests/validateProjVars";
import { getSpecFileContent, uploadSpecFile } from "../../lib/api/specFilesApi";

const XmlEditor = lazy(() => import("../common/XmlEditor").then(m => ({ default: m.XmlEditor })));

// ── Styles ──────────────────────────────────────────────────────────────────

const methodColor: Record<string, string> = {
  GET:    "text-[#1a7f37] bg-[#dafbe1]",
  POST:   "text-[#0969da] bg-[#ddf4ff]",
  PATCH:  "text-[#9a6700] bg-[#fff8c5]",
  PUT:    "text-[#bc4c00] bg-[#fff1e5]",
  DELETE: "text-[#d1242f] bg-[#ffebe9]",
};

const statusBadge: Record<TestStatus, { label: string; cls: string; icon: string }> = {
  idle:    { label: "Not run",  cls: "text-[#656d76] bg-[#eef1f6]",                          icon: "○" },
  running: { label: "Running",  cls: "text-[#0969da] bg-[#ddf4ff] animate-pulse",            icon: "⟳" },
  pass:    { label: "Pass",     cls: "text-[#1a7f37] bg-[#dafbe1]",                          icon: "✓" },
  fail:    { label: "Fail",     cls: "text-[#d1242f] bg-[#ffebe9]",                          icon: "✗" },
  error:   { label: "Error",    cls: "text-[#d1242f] bg-[#ffebe9]",                          icon: "✗" },
  skip:    { label: "Skipped",  cls: "text-[#656d76] bg-[#eef1f6]",                          icon: "—" },
};

// ── Small shared components ──────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-[#656d76] uppercase tracking-wider mb-1.5">
      {children}
    </p>
  );
}

/** Inline copy-to-clipboard button. Flips to a checkmark for 1.5 s after copy. */
function CopyButton({ value, className = "" }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    void navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <button
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy"}
      className={`shrink-0 text-[#afb8c1] hover:text-[#656d76] transition-colors ${className}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-[#1a7f37]">
          <path fillRule="evenodd" d="M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z" clipRule="evenodd"/>
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path fillRule="evenodd" d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v.5h1A1.5 1.5 0 0 1 13 5.5v7A1.5 1.5 0 0 1 11.5 14h-7A1.5 1.5 0 0 1 3 12.5v-7A1.5 1.5 0 0 1 4.5 4h1v-.5ZM7 3.5h2v.5H7v-.5Zm-2.5 2v7h7v-7h-7Z" clipRule="evenodd"/>
        </svg>
      )}
    </button>
  );
}

/** Hover tooltip — wraps any inline content. */
function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip inline-flex items-center">
      {children}
      <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tip:block z-20 bg-[#1f2328] text-white text-[11px] leading-snug rounded-md px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none max-w-xs">
        {text}
      </span>
    </span>
  );
}

/** JSON viewer (CodeMirror, read-only) with a copy button in the top-right corner. */
function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null)
    return <span className="text-[#afb8c1] italic text-xs">—</span>;
  const jsonStr =
    typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return (
    <div className="relative group/json border border-[#d1d9e0] rounded-md overflow-hidden max-h-56 bg-white">
      <CopyButton
        value={jsonStr}
        className="absolute top-1.5 right-1.5 z-10 opacity-0 group-hover/json:opacity-100 transition-opacity bg-white/80 rounded"
      />
      <JsonCodeBlock value={value} height="14rem" />
    </div>
  );
}

/**
 * Renders an object as a label / read-only-text / copy table.
 * Scalars render as plain text; objects/arrays fall back to a compact JSON
 * one-liner so each row stays single-line and copy-able.
 */
function StateSnapshotTable({ value }: { value: unknown }) {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return <JsonBlock value={value} />;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return <p className="text-xs text-[#afb8c1] italic px-3 py-2">No state captured</p>;
  }
  function format(v: unknown): string {
    if (v === null) return "null";
    if (v === undefined) return "";
    if (typeof v === "string") return v;
    if (typeof v === "number" || typeof v === "boolean") return String(v);
    return JSON.stringify(v);
  }
  return (
    <div className="divide-y divide-[#d8dee4] border-y border-[#d8dee4]">
      {entries.map(([key, v]) => {
        const text = format(v);
        return (
          <div key={key} className="group/row flex items-start gap-3 px-3 py-1.5 hover:bg-[#f6f8fa]">
            <span className="text-xs font-semibold text-[#656d76] w-40 shrink-0 truncate" title={key}>
              {key}
            </span>
            <span className="flex-1 font-mono text-xs text-[#1f2328] break-all select-text">
              {text || <span className="text-[#afb8c1] italic">(empty)</span>}
            </span>
            <CopyButton
              value={text}
              className="opacity-0 group-hover/row:opacity-100 transition-opacity mt-0.5"
            />
          </div>
        );
      })}
    </div>
  );
}

/** Single-line text block with an inline copy button. */
function CopyableText({ value, mono = true, className = "" }: { value: string; mono?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 group/text ${className}`}>
      <span className={`flex-1 break-all ${mono ? "font-mono" : ""} text-xs text-[#656d76]`}>{value}</span>
      <CopyButton value={value} className="opacity-0 group-hover/text:opacity-100 transition-opacity" />
    </div>
  );
}

// ── Design Tab ───────────────────────────────────────────────────────────────

/** Safely convert any value to a renderable string. Guards against objects
 *  being passed as React children (React error #185). */
function safeStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (v === null || v === undefined) return "";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

function DesignTab({ testId }: { testId: string }) {
  const def = getTest(testId);
  const { apiVersion } = useSetupStore();
  // Use stable selector — grab the variables array reference directly instead
  // of calling asRecord() which creates a new object every render and breaks
  // Zustand's Object.is equality check.
  const variables = useProjectVariablesStore((s) => s.variables);
  if (!def) return null;

  // Build project variables record from the stable array
  const projectVars: Record<string, string> = {};
  for (const v of variables) {
    projectVars[v.name] = v.value;
  }

  // Rewrite the leading /vN/ to the currently-selected API version so the
  // preview matches what the runner will actually hit.
  const displayPath = rewriteApiVersion(def.path, apiVersion);
  const pathTokens = displayPath.match(/\{[^}]+\}/g) ?? [];

  // Classify each path token and compute its expression + resolved value
  type ParamInfo = {
    token: string;       // e.g. "{project_id}"
    paramName: string;   // e.g. "project_id"
    kind: "proj" | "state" | "unknown";
    expression: string;  // e.g. "{{proj.projectId}}" or "{{state.createdId}}"
    resolved: string;    // actual value or the expression if unresolvable
    tooltip?: string;
  };

  const paramInfos: ParamInfo[] = pathTokens.map((token) => {
    const paramName = token.slice(1, -1);
    const meta = def.pathParamsMeta?.[paramName];

    if (meta) {
      const raw = meta.value; // e.g. "proj.projectId" or "{{state.createdId}}"
      const isProj = raw.startsWith("proj.");
      const varName = isProj ? raw.slice("proj.".length) : raw;
      const expression = raw.startsWith("{{") ? raw : `{{${raw}}}`;

      if (isProj) {
        const resolvedVal = projectVars[varName];
        return {
          token, paramName, kind: "proj" as const,
          expression,
          resolved: resolvedVal || "(not configured)",
          tooltip: meta.tooltip,
        };
      }
      // state or other expression
      return {
        token, paramName, kind: "state" as const,
        expression,
        resolved: expression, // state values only known at runtime
        tooltip: meta.tooltip,
      };
    }

    // No meta — try to match by token name against project variables
    const projVal = projectVars[paramName];
    if (projVal !== undefined) {
      return {
        token, paramName, kind: "proj" as const,
        expression: `{{proj.${paramName}}}`,
        resolved: projVal || "(not configured)",
      };
    }

    return {
      token, paramName, kind: "unknown" as const,
      expression: token,
      resolved: "(not configured)",
    };
  });

  // Build expression URL (with {{proj.X}} / {{state.X}} tokens)
  const expressionPath = paramInfos.reduce(
    (path, p) => path.replace(p.token, p.expression),
    displayPath,
  );

  // Build resolved URL (with actual values where available)
  const resolvedPath = paramInfos.reduce(
    (path, p) => path.replace(p.token, p.resolved),
    displayPath,
  );

  // Detect missing project variables — collect from path, query, and body
  const definedVarNames = new Set(variables.map((v) => v.name));
  const missingVars: { name: string; source: string }[] = [];
  const seenMissing = new Set<string>();

  // From path params
  for (const p of paramInfos) {
    if (p.kind === "proj" && p.resolved === "(not configured)" && !seenMissing.has(p.expression)) {
      const varName = p.expression.replace(/^\{\{proj\.|\}\}$/g, "");
      missingVars.push({ name: varName, source: "path parameter" });
      seenMissing.add(p.expression);
    }
  }

  // From query params
  if (def.queryParams) {
    for (const [k, v] of Object.entries(def.queryParams)) {
      if (v.startsWith("proj.")) {
        const varName = v.slice("proj.".length);
        if (!definedVarNames.has(varName) && !seenMissing.has(varName)) {
          missingVars.push({ name: varName, source: `query param "${k}"` });
          seenMissing.add(varName);
        }
      }
    }
  }

  // From request body
  if (def.sampleRequestBody !== undefined) {
    const bodyStr = typeof def.sampleRequestBody === "string"
      ? def.sampleRequestBody
      : JSON.stringify(def.sampleRequestBody);
    for (const m of bodyStr.matchAll(/\{\{proj\.(\w+)\}\}/g)) {
      const varName = m[1];
      if (!definedVarNames.has(varName) && !seenMissing.has(varName)) {
        missingVars.push({ name: varName, source: "request body" });
        seenMissing.add(varName);
      }
    }
  }

  return (
    <div className="p-4 space-y-5 text-sm">

      {/* Missing project variables warning */}
      {missingVars.length > 0 && (
        <div className="bg-[#ffebe9] border border-[#ffcecb] rounded-md px-3 py-2.5">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-[#d1242f] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[#d1242f] mb-1.5">
                Undefined project variable{missingVars.length > 1 ? "s" : ""} — this step will fail at runtime
              </p>
              <div className="space-y-1 mb-2">
                {missingVars.map((mv) => {
                  const suggestion = suggestSimilarVar(mv.name, definedVarNames);
                  return (
                    <div key={mv.name} className="flex items-center gap-2 text-xs flex-wrap">
                      <code className="font-mono text-[#d1242f] bg-white border border-[#ffcecb] px-1.5 py-0.5 rounded shrink-0">
                        proj.{mv.name}
                      </code>
                      <span className="text-[#656d76]">in {mv.source}</span>
                      {suggestion && (
                        <span className="text-[#9a6700]">
                          — did you mean <code className="font-mono font-semibold">proj.{suggestion}</code>?
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <a
                href="/settings"
                className="text-xs text-[#0969da] hover:underline font-medium"
              >
                Add in Settings → Variables
              </a>
            </div>
          </div>
        </div>
      )}

      {def.description && (
        <div className="text-xs text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff] rounded-md px-3 py-2">
          {safeStr(def.description)}
        </div>
      )}

      {/* Endpoint */}
      <div>
        <Label>Endpoint</Label>
        <div className="flex items-center gap-1.5 group/ep font-mono text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
          <span className={`font-bold mr-1 shrink-0 ${methodColor[def.method]?.split(" ")[0] ?? "text-[#656d76]"}`}>
            {safeStr(def.method)}
          </span>
          <span className="break-all flex-1">{safeStr(displayPath)}</span>
          <CopyButton value={`${def.method} ${displayPath}`} className="opacity-0 group-hover/ep:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Path Parameters */}
      {paramInfos.length > 0 && (
        <div>
          <Label>Path Parameters</Label>
          <div className="space-y-2.5">
            {paramInfos.map((p) => (
              <div key={p.token} className="text-xs">
                {/* Row 1: {token} → expression (badge) */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-[#656d76] bg-[#eef1f6] border border-[#d1d9e0] px-2 py-0.5 rounded shrink-0">
                    {safeStr(p.token)}
                  </span>
                  <span className="text-[#afb8c1]">→</span>
                  {p.tooltip ? (
                    <Tooltip text={safeStr(p.tooltip)}>
                      <span className={`font-mono px-2 py-0.5 rounded cursor-help underline decoration-dotted underline-offset-2 ${
                        p.kind === "proj"
                          ? "text-[#1a7f37] bg-[#dafbe1] border border-[#aceebb]"
                          : "text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff]"
                      }`}>
                        {safeStr(p.expression)}
                      </span>
                    </Tooltip>
                  ) : (
                    <span className={`font-mono px-2 py-0.5 rounded ${
                      p.kind === "proj"
                        ? "text-[#1a7f37] bg-[#dafbe1] border border-[#aceebb]"
                        : p.kind === "state"
                          ? "text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff]"
                          : "text-[#9a6700] italic"
                    }`}>
                      {safeStr(p.expression)}
                    </span>
                  )}
                  <span className={`text-[11px] italic ${
                    p.kind === "proj" ? "text-[#1a7f37]" : p.kind === "state" ? "text-[#656d76]" : "text-[#9a6700]"
                  }`}>
                    {p.kind === "proj" ? "project variable" : p.kind === "state" ? "runtime" : "not configured"}
                  </span>
                </div>
                {/* Row 2: resolved value for project variables */}
                {p.kind === "proj" && p.resolved !== "(not configured)" && (
                  <div className="flex items-center gap-2 mt-1 ml-6 group/pval">
                    <span className="text-[#afb8c1]">→</span>
                    <span className="font-mono text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] px-2 py-0.5 rounded">
                      {safeStr(p.resolved)}
                    </span>
                    <CopyButton value={p.resolved} className="opacity-0 group-hover/pval:opacity-100 transition-opacity" />
                  </div>
                )}
                {p.kind === "proj" && p.resolved === "(not configured)" && (
                  <div className="flex items-center gap-2 mt-1 ml-6">
                    <span className="text-[#afb8c1]">→</span>
                    <span className="text-[#9a6700] italic">Set in Settings → Variables</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* URL resolution preview — expression → resolved */}
          <div className="mt-3 space-y-1.5">
            {/* Expression URL */}
            <div className="flex items-start gap-1.5 group/expr font-mono text-xs text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
              <span className="text-[#afb8c1] mr-0.5 shrink-0 mt-px">→</span>
              <span className="break-all flex-1">{safeStr(expressionPath)}</span>
              <CopyButton value={expressionPath} className="opacity-0 group-hover/expr:opacity-100 transition-opacity shrink-0" />
            </div>
            {/* Resolved URL (only show if different from expression) */}
            {resolvedPath !== expressionPath && (
              <div className="flex items-start gap-1.5 group/url font-mono text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
                <span className="text-[#afb8c1] mr-0.5 shrink-0 mt-px">→</span>
                <span className="break-all flex-1">{safeStr(resolvedPath)}</span>
                <CopyButton value={resolvedPath} className="opacity-0 group-hover/url:opacity-100 transition-opacity shrink-0" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Query Parameters */}
      {def.queryParams && Object.keys(def.queryParams).length > 0 && (
        <div>
          <Label>Query Parameters</Label>
          <div className="space-y-1.5">
            {Object.entries(def.queryParams).map(([k, v]) => {
              const isProj = v.startsWith("proj.");
              const projVarName = isProj ? v.slice("proj.".length) : "";
              const resolvedVal = isProj ? (projectVars[projVarName] || "(not configured)") : v;
              const expression = isProj ? `{{${v}}}` : v;

              return (
                <div key={k} className="text-xs">
                  <div className="flex items-center gap-2 group/qp">
                    <span className="font-mono text-[#656d76] bg-[#eef1f6] border border-[#d1d9e0] px-2 py-0.5 rounded shrink-0">
                      {safeStr(k)}
                    </span>
                    <span className="text-[#afb8c1]">=</span>
                    <span className={`font-mono px-2 py-0.5 rounded ${
                      isProj
                        ? "text-[#1a7f37] bg-[#dafbe1] border border-[#aceebb]"
                        : "text-[#1f2328]"
                    }`}>
                      {safeStr(expression)}
                    </span>
                    {isProj && (
                      <span className="text-[11px] text-[#1a7f37] italic">project variable</span>
                    )}
                    <CopyButton value={`${k}=${resolvedVal}`} className="opacity-0 group-hover/qp:opacity-100 transition-opacity" />
                  </div>
                  {isProj && resolvedVal !== "(not configured)" && (
                    <div className="flex items-center gap-2 mt-1 ml-6 group/qpval">
                      <span className="text-[#afb8c1]">→</span>
                      <span className="font-mono text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] px-2 py-0.5 rounded">
                        {safeStr(resolvedVal)}
                      </span>
                      <CopyButton value={resolvedVal} className="opacity-0 group-hover/qpval:opacity-100 transition-opacity" />
                    </div>
                  )}
                  {isProj && resolvedVal === "(not configured)" && (
                    <div className="flex items-center gap-2 mt-1 ml-6">
                      <span className="text-[#afb8c1]">→</span>
                      <span className="text-[#9a6700] italic">Set in Settings → Variables</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Request Body */}
      {def.sampleRequestBody !== undefined && (
        <div>
          <Label>Request Body</Label>
          <JsonBlock value={def.sampleRequestBody} />
        </div>
      )}

      {/* Assertions */}
      {def.assertions.length > 0 ? (
        <div>
          <Label>Assertions</Label>
          <div className="space-y-1">
            {def.assertions.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs text-[#1f2328] px-3 py-2 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md">
                <span className="text-[#afb8c1] mt-0.5 shrink-0">◆</span>
                <span className="flex-1">{safeStr(a.description)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <Label>Assertions</Label>
          <span className="text-xs text-[#afb8c1] italic">No assertions defined</span>
        </div>
      )}

      {/* Footer metadata */}
      <div className="border-t border-[#d1d9e0] pt-4 space-y-1.5 text-xs text-[#afb8c1]">
        <div><span className="font-medium text-[#656d76]">Flow:</span> {safeStr(def.tag)}</div>
        {def.entity && <div><span className="font-medium text-[#656d76]">Entity:</span> {safeStr(def.entity)}</div>}
        <div className="flex items-center gap-1.5 group/id">
          <span className="font-medium text-[#656d76]">Scenario ID:</span>
          <span className="font-mono">{safeStr(def.id)}</span>
          <CopyButton value={def.id} className="opacity-0 group-hover/id:opacity-100 transition-opacity" />
        </div>
      </div>
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function Accordion({
  title,
  badge: badgeNode,
  defaultOpen = false,
  children,
}: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] hover:bg-[#eef1f6] transition-colors text-left"
      >
        <svg
          className={`w-3.5 h-3.5 text-[#656d76] shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        <span className="text-xs font-semibold text-[#656d76] uppercase tracking-wider flex-1">
          {title}
        </span>
        {badgeNode}
      </button>
      {open && <div className="border-t border-[#d1d9e0]">{children}</div>}
    </div>
  );
}

// ── AI Debug Analysis — Diagnose Tab ─────────────────────────────────────────

const confidenceBadge: Record<string, { cls: string; label: string }> = {
  high:   { cls: "text-[#1a7f37] bg-[#dafbe1] border-[#aceebb]", label: "High confidence" },
  medium: { cls: "text-[#9a6700] bg-[#fff8c5] border-[#f5e0a0]", label: "Medium confidence" },
  low:    { cls: "text-[#656d76] bg-[#f6f8fa] border-[#d1d9e0]", label: "Low confidence" },
};

const categoryLabel: Record<string, string> = {
  extra_field: "Extra field in request",
  missing_field: "Missing required field",
  wrong_value: "Wrong field value",
  schema_mismatch: "Schema mismatch",
  auth_error: "Authentication error",
  upstream_error: "Server error",
  no_spec: "Spec not available",
  other: "Other",
};

/** Pretty-print a JSON string (or pass through non-JSON text). */
function prettyJson(s: string): string {
  try { return JSON.stringify(JSON.parse(s), null, 2); } catch { return s; }
}

// ── Diagnosis cache — survives tab switches within the same session ──────────
interface DiagnosisCache {
  diagnosis: DebugDiagnosis;
  costUsd: number;
  fingerprint: string; // httpStatus:failureReason — invalidate when a new run changes the result
}
const diagnosisCache = new Map<string, DiagnosisCache>();

/** Append a diagnostic lesson to the version folder's _skills.md so future AI
 *  flow generation and idea generation avoid the same mistake. */
async function saveDiagnosticLesson(
  flowFileName: string,
  diagnosis: DebugDiagnosis,
  stepName: string,
  endpoint: string,
): Promise<void> {
  // Extract version folder from flow file path (e.g. "V3/Categories/foo.flow.xml" → "V3")
  const versionFolder = flowFileName.split("/")[0];
  if (!versionFolder) return;

  const skillsPath = `${versionFolder}/_system/_skills.md`;
  const category = diagnosis.whatWentWrong ?? diagnosis.category ?? "unknown";
  const fields = diagnosis.problematicFields?.map((f) => f.field).join(", ") ?? "";
  const date = new Date().toISOString().slice(0, 10);

  const lesson = `- **${endpoint}** — ${category}${fields ? `: \`${fields}\`` : ""}. ${diagnosis.fixPrompt ?? diagnosis.summary ?? ""} _(${date}, step: ${stepName})_`;

  let existing = "";
  try {
    existing = await getSpecFileContent(skillsPath);
  } catch {
    // _skills.md doesn't exist yet — try legacy Skills.md, or will create new
    try {
      existing = await getSpecFileContent(`${flowFileName.split("/")[0]}/Skills.md`);
    } catch { /* neither exists — will create */ }
  }

  const SECTION_HEADER = "## Lessons Learned";
  let updated: string;
  if (existing.includes(SECTION_HEADER)) {
    // Check for duplicate — skip if same endpoint+fields lesson already exists
    const dedupeKey = `**${endpoint}**`;
    const fieldKey = fields ? `\`${fields}\`` : "";
    const lines = existing.split("\n");
    const hasDuplicate = lines.some((l) => l.includes(dedupeKey) && (!fieldKey || l.includes(fieldKey)));
    if (hasDuplicate) return;
    // Append new lesson after the section header
    updated = existing.replace(SECTION_HEADER, `${SECTION_HEADER}\n${lesson}`);
  } else {
    // Add the section at the end
    updated = existing.trimEnd() + `\n\n${SECTION_HEADER}\n\nThese rules were auto-discovered from test failures. Follow them when generating flow XML.\n\n${lesson}\n`;
  }

  await uploadSpecFile(skillsPath, updated);
}

/** Parse numbered steps (e.g. "1. Do X 2. Do Y") into an ordered list. */
function HowToFixSteps({ text }: { text: string }) {
  // Defensive: AI may return non-string (array, object) — coerce to string
  const safeText = typeof text === "string" ? text : Array.isArray(text) ? (text as string[]).join("\n") : String(text ?? "");
  if (!safeText) return null;
  // Split on numbered prefixes like "1. ", "2. " etc. — handles both newline-separated and inline
  const steps = safeText.split(/(?:^|\n|\s)(?=\d+\.\s)/).map(s => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  if (steps.length <= 1) {
    return <p className="text-sm text-[#1f2328] leading-relaxed mb-3">{text}</p>;
  }
  return (
    <ol className="text-sm text-[#1f2328] leading-relaxed mb-3 list-decimal list-inside space-y-1">
      {steps.map((step, i) => <li key={i}>{step}</li>)}
    </ol>
  );
}

function DiagnoseTab({ testId }: { testId: string }) {
  const aiModel = useSetupStore((s) => s.aiModel);
  const result = useRunnerStore((s) => s.testResults[testId]);

  // Invalidate cache if a newer run produced different results
  const resultFingerprint = result ? `${result.httpStatus}:${result.failureReason ?? ""}` : "";
  const cached = diagnosisCache.get(testId);
  const cacheValid = cached && cached.fingerprint === resultFingerprint;

  const [state, setState] = useState<"idle" | "loading" | "done" | "error">(cacheValid ? "done" : "idle");
  const [diagnosis, setDiagnosis] = useState<DebugDiagnosis | null>(cacheValid ? cached.diagnosis : null);
  const [costUsd, setCostUsd] = useState(cacheValid ? cached.costUsd : 0);
  const [error, setError] = useState<string | null>(null);
  const [fixState, setFixState] = useState<"idle" | "fixing" | "done" | "error">("idle");
  const [fixError, setFixError] = useState<string | null>(null);
  const [fixIndex, setFixIndex] = useState(0);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [reportCopied, setReportCopied] = useState(false);

  // Auto-trigger analysis when tab opens for the first time (skip if cached)
  const triggered = useRef(!!cacheValid);
  useEffect(() => {
    if (!triggered.current && state === "idle") {
      triggered.current = true;
      void handleAnalyze();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAnalyze() {
    setState("loading");
    setError(null);
    setFixState("idle");
    setFixError(null);

    const testDef = getTest(testId);
    if (!testDef) {
      setError("Test definition not found");
      setState("error");
      return;
    }

    try {
      // Try minimal mode: extract stepNumber from testId and look up scenarioId
      const stepMatch = testId.match(/\.s(\d+)$/);
      const stepNumber = stepMatch ? parseInt(stepMatch[1], 10) : null;
      const scenarioId = testDef.flowFileName
        ? useFlowStatusStore.getState().byName[testDef.flowFileName]?.scenarioId
        : undefined;

      let res;
      if (scenarioId && stepNumber) {
        // Minimal mode — backend pulls everything from Cosmos
        res = await analyzeFailureByScenario({ scenarioId, stepNumber, model: aiModel });
      } else {
        // Fallback — full payload mode
        let flowXml: string | undefined;
        try {
          if (testDef.flowFileName) flowXml = await getFlowFileContent(testDef.flowFileName);
        } catch { /* ok without it */ }

        res = await analyzeFailure({
          step: {
            name: testDef.name,
            method: testDef.method,
            path: testDef.path,
            requestUrl: result?.requestUrl,
            requestBody: result?.requestBody,
            responseBody: result?.responseBody,
            httpStatus: result?.httpStatus,
            failureReason: result?.failureReason,
            assertionResults: result?.assertionResults?.map((a) => ({ description: a.description, passed: a.passed })),
          },
          flowXml,
        });
      }

      setDiagnosis(res.diagnosis);
      setCostUsd(res.usage.costUsd);
      diagnosisCache.set(testId, { diagnosis: res.diagnosis, costUsd: res.usage.costUsd, fingerprint: resultFingerprint });
      useAiCostStore.getState().addAdhocCost(res.usage.costUsd);
      setState("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  async function handleFixIt(promptOverride?: string) {
    const prompt = promptOverride ?? diagnosis?.fixPrompt;
    if (!prompt) return;
    const testDef = getTest(testId);
    if (!testDef?.flowFileName) return;

    setFixState("fixing");
    setFixError(null);

    const fileName = testDef.flowFileName;
    try {
      const xml = await getFlowFileContent(fileName);
      // Extract version folder and pass endpoint context for spec-aware editing
      const versionFolder = fileName.split("/")[0] || undefined;
      const edited = await editFlowXml(
        xml, prompt, aiModel, undefined,
        versionFolder, testDef.method, testDef.path,
      );

      // Track AI edit cost
      if (edited.usage) {
        useAiCostStore.getState().addAdhocCost(edited.usage.costUsd);
      }

      const validation = validateFlowXml(edited.xml);
      if (!validation.ok) {
        setFixError("AI fix produced invalid XML. Please edit manually in the Flow XML tab.");
        setFixState("error");
        return;
      }

      // Save, activate, and fully reload — mirrors FlowXmlTab.handleSave
      await saveFlowFile(fileName, edited.xml, true);
      await activateFlow(fileName);
      await loadFlowsFromQueue();
      const built = buildParsedTagsFromRegistry();
      useSpecStore.getState().setSpec(null as never, built, null as never);

      // Persist lesson to _skills.md so future AI generations avoid this mistake
      try {
        if (diagnosis) await saveDiagnosticLesson(fileName, diagnosis, testDef.name, `${testDef.method} ${testDef.path}`);
      } catch (e) {
        console.warn("[DiagnoseTab] Failed to save lesson:", e);
      }

      // Clear diagnosis cache so re-analyze will see updated state
      diagnosisCache.delete(testId);

      setFixState("done");
    } catch (e) {
      setFixError(e instanceof Error ? e.message : String(e));
      setFixState("error");
    }
  }

  function buildDiagnosticReport(): string {
    const testDef = getTest(testId);
    const lines: string[] = [];
    lines.push("## FlowForge Diagnostic Report");
    if (testDef) lines.push(`**Step:** ${testDef.method} ${testDef.path}`);
    if (result?.httpStatus) lines.push(`**HTTP Status:** ${result.httpStatus}`);
    const summaryText = diagnosis?.summary ?? diagnosis?.rootCause ?? "";
    lines.push(`**Summary:** ${summaryText}`);
    if (diagnosis?.developerNote) lines.push(`**Developer Note:** ${diagnosis.developerNote}`);
    if (result?.requestBody !== undefined) {
      lines.push("", "### Request Body", "```json", JSON.stringify(result.requestBody, null, 2), "```");
    }
    if (result?.responseBody !== undefined) {
      lines.push("", "### Response Body", "```json", JSON.stringify(result.responseBody, null, 2), "```");
    }
    if (diagnosis) {
      lines.push("", "### Raw Diagnosis", "```json", JSON.stringify(diagnosis, null, 2), "```");
    }
    return lines.join("\n");
  }

  if (state === "idle" || state === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-48 gap-3">
        <svg className="w-6 h-6 animate-spin text-[#0969da]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
        </svg>
        <span className="text-sm text-[#656d76]">Analyzing failure with AI...</span>
        <span className="text-xs text-[#afb8c1]">Cross-referencing request against endpoint spec</span>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="p-4 space-y-3">
        <div className="px-3 py-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
          Analysis failed: {error}
        </div>
        <button
          onClick={() => void handleAnalyze()}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] transition-colors cursor-pointer"
        >
          Retry analysis
        </button>
      </div>
    );
  }

  // state === "done"
  if (!diagnosis) return null;

  const conf = confidenceBadge[diagnosis.confidence] ?? confidenceBadge.low;
  // Defensive: AI may return non-string values — coerce everything to string
  const str = (v: unknown): string => typeof v === "string" ? v : v != null ? String(v) : "";
  // Use new whatWentWrong field, fall back to categoryLabel for legacy responses
  const issueLabel = str(diagnosis.whatWentWrong) || categoryLabel[diagnosis.category] || str(diagnosis.category);
  // Use summary, fall back to rootCause for legacy cached responses
  const summaryText = str(diagnosis.summary) || str(diagnosis.rootCause);

  return (
    <div className="p-4 space-y-4 text-sm">

      {/* A. Summary card */}
      <div className="px-3 py-3 rounded-md bg-[#ddf4ff] border border-[#54aeff]">
        <div className="flex items-center gap-2 mb-2">
          <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
          </svg>
          <span className="text-sm font-semibold text-[#1f2328]">AI Diagnosis</span>
          <span className={`text-xs px-1.5 py-0.5 rounded border ${conf.cls}`}>{conf.label}</span>
          <span className="text-xs px-1.5 py-0.5 rounded border border-[#54aeff] bg-[#ddf4ff] text-[#0969da]">{issueLabel}</span>
        </div>
        <p className="text-sm text-[#1f2328] leading-relaxed">{summaryText}</p>
      </div>

      {/* B. What to do next */}
      {diagnosis.canYouFixIt ? (() => {
        // Build list of actionable fixes — per-field fixes take priority over the single fixPrompt
        const fixes: Array<{ label: string; description: string; prompt: string }> = [];
        if (diagnosis.problematicFields && diagnosis.problematicFields.length > 0) {
          for (const f of diagnosis.problematicFields) {
            const prompt = f.fixPrompt ?? `In the flow XML, fix the "${f.field}" field: ${f.suggestion}`;
            fixes.push({ label: f.field, description: `${f.issue} — ${f.suggestion}`, prompt });
          }
        }
        // Fall back to single fixPrompt if no per-field fixes
        if (fixes.length === 0 && diagnosis.fixPrompt) {
          fixes.push({ label: "Fix", description: diagnosis.howToFix ?? "", prompt: diagnosis.fixPrompt });
        }
        const total = fixes.length;
        const safeIdx = Math.min(fixIndex, total - 1);
        const current = fixes[safeIdx];

        return (
          <div className="px-3 py-3 rounded-md bg-[#dafbe1] border border-[#aceebb]">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs font-semibold text-[#1a7f37] uppercase tracking-wide">How to fix</span>
              {total > 1 && (
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    onClick={() => { setFixIndex(Math.max(0, safeIdx - 1)); if (fixState === "done") setFixState("idle"); }}
                    disabled={safeIdx === 0}
                    className="p-0.5 rounded hover:bg-[#aceebb]/50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    title="Previous fix"
                  >
                    <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
                    </svg>
                  </button>
                  <span className="text-xs font-medium text-[#1a7f37] tabular-nums">{safeIdx + 1} of {total}</span>
                  <button
                    onClick={() => { setFixIndex(Math.min(total - 1, safeIdx + 1)); if (fixState === "done") setFixState("idle"); }}
                    disabled={safeIdx === total - 1}
                    className="p-0.5 rounded hover:bg-[#aceebb]/50 disabled:opacity-30 cursor-pointer disabled:cursor-default"
                    title="Next fix"
                  >
                    <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
            {current && (
              <>
                {total > 1 && (
                  <p className="text-xs font-mono text-[#1a7f37] mb-1">
                    <span className="font-semibold">{current.label}</span>: {current.description}
                  </p>
                )}
                {total === 1 && diagnosis.howToFix && <HowToFixSteps text={diagnosis.howToFix} />}
                {fixState === "idle" && (
                  <button
                    onClick={() => void handleFixIt(current.prompt)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#16653a] transition-colors cursor-pointer"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.049.58.025 1.193-.14 1.743" />
                    </svg>
                    {total > 1 ? `Fix "${current.label}"` : "Fix it automatically"}
                  </button>
                )}
                {fixState === "fixing" && (
                  <div className="flex items-center gap-2 text-sm text-[#656d76]">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                    </svg>
                    Applying fix...
                  </div>
                )}
                {fixState === "done" && (
                  <div className="flex items-center gap-1.5 text-sm text-[#1a7f37] font-medium">
                    <span>✓</span> Flow XML fixed and saved.{total > 1 ? " Navigate to next fix or re-run the scenario." : " Re-run the scenario to verify."}
                  </div>
                )}
                {fixState === "error" && (
                  <div className="text-sm text-[#d1242f]">{fixError}</div>
                )}
              </>
            )}
            {!current && diagnosis.howToFix && <HowToFixSteps text={diagnosis.howToFix} />}
          </div>
        );
      })() : (
        <div className="px-3 py-3 rounded-md bg-[#fff8c5] border border-[#f5e0a0]">
          <span className="text-xs font-semibold text-[#9a6700] uppercase tracking-wide block mb-1">Needs developer attention</span>
          <p className="text-sm text-[#1f2328]">This issue can't be fixed by editing the flow XML. Use the "Copy diagnostic report" button below to share details with your development team.</p>
        </div>
      )}

      {/* C. Problematic Fields */}
      {diagnosis.problematicFields && diagnosis.problematicFields.length > 0 && (
        <div>
          <Label>Problematic Fields</Label>
          <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#f6f8fa] text-left">
                  <th className="px-3 py-1.5 font-medium text-[#656d76]">Field</th>
                  <th className="px-3 py-1.5 font-medium text-[#656d76]">Issue</th>
                  <th className="px-3 py-1.5 font-medium text-[#656d76]">Fix</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d1d9e0]">
                {diagnosis.problematicFields.map((f, i) => (
                  <tr key={i} className="bg-[#ffebe9]/30">
                    <td className="px-3 py-1.5 font-mono text-[#d1242f]">{f.field}</td>
                    <td className="px-3 py-1.5 text-[#1f2328]">{f.issue}</td>
                    <td className="px-3 py-1.5 text-[#1a7f37]">{f.suggestion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* D. Suggested Fix diff */}
      {diagnosis.suggestedFix && (
        <div>
          <Label>Suggested Fix</Label>
          <p className="text-sm text-[#1f2328] mb-2">{diagnosis.suggestedFix.description}</p>
          <div className="border border-[#d1d9e0] rounded-md overflow-hidden max-h-64">
            <XmlDiffView
              original={prettyJson(diagnosis.suggestedFix.before)}
              modified={prettyJson(diagnosis.suggestedFix.after)}
            />
          </div>
        </div>
      )}

      {/* E. Advanced: Full Diagnostic Data */}
      <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-2 w-full px-3 py-2 text-xs font-medium text-[#656d76] bg-[#f6f8fa] hover:bg-[#eaeef2] transition-colors cursor-pointer"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${advancedOpen ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
          </svg>
          Advanced: Full Diagnostic Data
          <button
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard.writeText(buildDiagnosticReport()).then(() => {
                setReportCopied(true);
                setTimeout(() => setReportCopied(false), 2000);
              });
            }}
            className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded text-xs text-[#0969da] hover:bg-[#ddf4ff] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
            </svg>
            {reportCopied ? "Copied!" : "Copy diagnostic report"}
          </button>
        </button>
        {advancedOpen && (
          <div className="p-3 space-y-3 border-t border-[#d1d9e0]">
            {/* Developer Note */}
            {(diagnosis.developerNote ?? diagnosis.details) && (
              <div>
                <span className="text-xs font-semibold text-[#656d76] block mb-1">Developer Note</span>
                <p className="text-xs text-[#1f2328] whitespace-pre-wrap leading-relaxed">{diagnosis.developerNote ?? diagnosis.details}</p>
              </div>
            )}
            {/* Raw request/response */}
            {result?.requestBody !== undefined && (
              <div>
                <span className="text-xs font-semibold text-[#656d76] block mb-1">Request Body</span>
                <div className="border border-[#d1d9e0] rounded overflow-hidden max-h-48">
                  <JsonCodeBlock value={result.requestBody} height="auto" />
                </div>
              </div>
            )}
            {result?.responseBody !== undefined && (
              <div>
                <span className="text-xs font-semibold text-[#656d76] block mb-1">Response Body</span>
                <div className="border border-[#d1d9e0] rounded overflow-hidden max-h-48">
                  <JsonCodeBlock value={result.responseBody} height="auto" />
                </div>
              </div>
            )}
            {/* Raw diagnosis JSON */}
            <div>
              <span className="text-xs font-semibold text-[#656d76] block mb-1">Raw AI Response</span>
              <div className="border border-[#d1d9e0] rounded overflow-hidden max-h-48">
                <JsonCodeBlock value={diagnosis} height="auto" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* F. Footer — cost + re-analyze */}
      <div className="flex items-center gap-3 pt-1">
        <span className="text-xs text-[#afb8c1]">Cost: ${costUsd.toFixed(4)}</span>
        <button
          onClick={() => { diagnosisCache.delete(testId); setState("idle"); triggered.current = false; void handleAnalyze(); }}
          className="text-xs text-[#0969da] hover:underline cursor-pointer"
        >
          Re-analyze
        </button>
      </div>
    </div>
  );
}

// ── Run Tab ──────────────────────────────────────────────────────────────────

function RunTab({ testId, onDiagnose }: { testId: string; onDiagnose?: () => void }) {
  const result = useRunnerStore((s) => s.testResults[testId]);
  const status = result?.status ?? "idle";

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[#afb8c1] gap-2">
        <span className="text-3xl">○</span>
        <span className="text-sm">Not run yet</span>
        <span className="text-xs">Run the scenario to see results here</span>
      </div>
    );
  }

  const badge = statusBadge[status];
  const reqHeaderCount = result?.requestHeaders ? Object.keys(result.requestHeaders).length : 0;
  const resHeaderCount = result?.responseHeaders ? Object.keys(result.responseHeaders).length : 0;

  return (
    <div className="p-4 space-y-4 text-sm">

      {/* Status row */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#f6f8fa] border border-[#d1d9e0]">
        <span className={`text-[13px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.icon} {badge.label}
        </span>
        {result?.httpStatus && (
          <span className="font-mono text-xs text-[#656d76]">HTTP {result.httpStatus}</span>
        )}
        {result?.durationMs !== undefined && (
          <span className="ml-auto text-xs text-[#afb8c1]">{result.durationMs}ms</span>
        )}
        {(status === "fail" || status === "error") && onDiagnose && (
          <button
            onClick={onDiagnose}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-white bg-[#8250df] hover:bg-[#7340c9] transition-colors cursor-pointer shrink-0 ml-auto"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            Analyze with AI
          </button>
        )}
      </div>

      {/* Failure reason */}
      {result?.failureReason && (
        <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
          <div className="flex items-start gap-1.5 group/fail">
            <div className="flex-1">
              <span className="font-semibold block mb-0.5">Failure reason</span>
              {result.failureReason}
            </div>
            <CopyButton value={result.failureReason} className="opacity-0 group-hover/fail:opacity-100 transition-opacity mt-0.5" />
          </div>
        </div>
      )}

      {/* Request URL */}
      {result?.requestUrl && (
        <div>
          <Label>Request URL</Label>
          <div className="font-mono text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
            <CopyableText value={result.requestUrl} />
          </div>
        </div>
      )}

      {/* Request Headers (accordion) */}
      {reqHeaderCount > 0 && (
        <Accordion
          title="Request Headers"
          badge={<span className="text-[11px] text-[#656d76] tabular-nums">{reqHeaderCount}</span>}
        >
          <div className="divide-y divide-[#d1d9e0]">
            {Object.entries(result.requestHeaders!).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 px-3 py-1.5 text-xs group/hdr">
                <span className="font-mono font-medium text-[#0969da] shrink-0">{key}</span>
                <span className="font-mono text-[#1f2328] break-all flex-1">{key === "Authorization" ? value.slice(0, 12) + "••••••" : value}</span>
                <CopyButton value={`${key}: ${value}`} className="opacity-0 group-hover/hdr:opacity-100 transition-opacity shrink-0" />
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* Request Body (accordion) */}
      {result?.requestBody !== undefined && (
        <Accordion title="Request Body" defaultOpen={true}>
          <div className="p-0">
            <JsonBlock value={result.requestBody} />
          </div>
        </Accordion>
      )}

      {/* Response Headers (accordion) */}
      {resHeaderCount > 0 && (
        <Accordion
          title="Response Headers"
          badge={<span className="text-[11px] text-[#656d76] tabular-nums">{resHeaderCount}</span>}
        >
          <div className="divide-y divide-[#d1d9e0]">
            {Object.entries(result.responseHeaders!).map(([key, value]) => (
              <div key={key} className="flex items-start gap-2 px-3 py-1.5 text-xs group/hdr">
                <span className="font-mono font-medium text-[#0969da] shrink-0">{key}</span>
                <span className="font-mono text-[#1f2328] break-all flex-1">{value}</span>
                <CopyButton value={`${key}: ${value}`} className="opacity-0 group-hover/hdr:opacity-100 transition-opacity shrink-0" />
              </div>
            ))}
          </div>
        </Accordion>
      )}

      {/* Response Body (accordion) */}
      <Accordion title="Response Body" defaultOpen={true}>
        <div className="p-0">
          {result?.responseBody !== undefined
            ? <JsonBlock value={result.responseBody} />
            : <p className="text-xs text-[#afb8c1] italic px-3 py-2">No content to display</p>
          }
        </div>
      </Accordion>

      {/* State Snapshot (accordion) — shown when extra context was captured */}
      {result?.stateSnapshot !== undefined && (
        <Accordion
          title="State Snapshot"
          badge={
            <span className="text-[11px] text-[#9a6700] bg-[#fff8c5] border border-[#f5e0a0] px-1.5 py-0.5 rounded">
              debug context
            </span>
          }
        >
          <div className="p-0">
            <StateSnapshotTable value={result.stateSnapshot} />
          </div>
        </Accordion>
      )}

      {/* Assertion results */}
      {result?.assertionResults && result.assertionResults.length > 0 && (
        <div>
          <Label>Assertion Results</Label>
          <div className="space-y-1">
            {result.assertionResults.map((a) => (
              <div
                key={a.id}
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border ${
                  a.passed
                    ? "text-[#1a7f37] bg-[#dafbe1] border-[#aceebb]"
                    : "text-[#d1242f] bg-[#ffebe9] border-[#ffcecb]"
                }`}
              >
                <span className="font-bold shrink-0">{a.passed ? "✓" : "✗"}</span>
                <span className="flex-1">{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface DetailPaneProps {
  testId: string | null;
  onClose: () => void;
}

type Tab = "design" | "run" | "diagnose" | "xml";

// ── Flow XML Tab ─────────────────────────────────────────────────────────────

type EditMode = "view" | "manual" | "ai-prompt" | "ai-loading" | "ai-review";

function FlowXmlTab({ fileName }: { fileName: string }) {
  const [xml, setXml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("view");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  // Lock state — if locked, editing is disabled for everyone
  const flowEntry = useFlowStatusStore((s) => s.byName[fileName]);
  const isLocked = !!flowEntry?.lockedBy;
  const canUnlock = useUserStore((s) => s.hasRole("qa_manager"));
  const [unlocking, setUnlocking] = useState(false);
  const lockTooltip = flowEntry?.lockedBy
    ? `Locked by ${flowEntry.lockedBy.name}${canUnlock ? " — click to unlock" : ". Unlock the scenario before editing."}`
    : undefined;

  async function handleUnlock() {
    if (!canUnlock) return;
    setUnlocking(true);
    try {
      await unlockFlow(fileName);
      const store = useFlowStatusStore.getState();
      const entry = store.byName[fileName];
      if (entry) store.setEntry({ ...entry, lockedBy: undefined, lockedAt: undefined });
    } catch (err) {
      alert(`Failed to unlock: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setUnlocking(false);
    }
  }
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // AI Edit state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiCost, setAiCost] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { setSpec } = useSpecStore();
  const aiModel = useSetupStore((s) => s.aiModel);

  useEffect(() => {
    let cancelled = false;
    setXml(null);
    setLoadError(null);
    setEditMode("view");
    setSaveSuccess(false);
    setAiResult(null);
    setAiError(null);
    setAiPrompt("");
    getFlowFileContent(fileName)
      .then((content) => { if (!cancelled) setXml(content); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [fileName]);

  // ── Manual edit handlers ──────────────────────────────────────────────────

  function handleStartManualEdit() {
    if (xml === null) return;
    setDraft(xml);
    setEditMode("manual");
    setValidationError(null);
    setSaveSuccess(false);
  }

  function handleCancelEdit() {
    setEditMode("view");
    setValidationError(null);
    setAiResult(null);
    setAiError(null);
    setAiCost(null);
    setAiPrompt("");
    if (abortRef.current) { abortRef.current.abort(); abortRef.current = null; }
  }

  function handleDraftChange(next: string) {
    setDraft(next);
    setValidationError(null);
    setSaveSuccess(false);
  }

  async function handleSave(content?: string) {
    const toSave = content ?? draft;
    const result = validateFlowXml(toSave);
    if (!result.ok) {
      setValidationError(result.error ?? "Invalid XML");
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      await saveFlowFile(fileName, toSave, true);
      await activateFlow(fileName);
      setXml(toSave);
      setEditMode("view");
      setAiResult(null);
      setAiError(null);
      setAiCost(null);
      setAiPrompt("");
      setSaveSuccess(true);
      await loadFlowsFromQueue();
      const built = buildParsedTagsFromRegistry();
      setSpec(null as never, built, null as never);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setValidationError(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  // ── AI Edit handlers ──────────────────────────────────────────────────────

  function handleStartAiEdit() {
    if (xml === null) return;
    setEditMode("ai-prompt");
    setAiPrompt("");
    setAiResult(null);
    setAiError(null);
    setAiCost(null);
    setValidationError(null);
    setSaveSuccess(false);
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  const handleAiGenerate = useCallback(async () => {
    if (!xml || !aiPrompt.trim()) return;
    setEditMode("ai-loading");
    setAiError(null);
    setAiCost(null);
    setValidationError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await editFlowXml(xml, aiPrompt.trim(), aiModel, controller.signal);
      if (controller.signal.aborted) return;
      setAiResult(result.xml);
      setDraft(result.xml);
      if (result.usage) {
        setAiCost(`$${result.usage.costUsd.toFixed(4)} (${result.usage.totalTokens.toLocaleString()} tokens)`);
        useAiCostStore.getState().addAdhocCost(result.usage.costUsd);
      }
      setEditMode("ai-review");
    } catch (err) {
      if (controller.signal.aborted) return;
      setAiError(err instanceof Error ? err.message : String(err));
      setEditMode("ai-prompt");
    } finally {
      abortRef.current = null;
    }
  }, [xml, aiPrompt, aiModel]);

  function handleAiAccept() {
    if (!aiResult) return;
    void handleSave(aiResult);
  }

  function handleAiEditManually() {
    if (!aiResult) return;
    setDraft(aiResult);
    setEditMode("manual");
    setAiResult(null);
    setAiCost(null);
  }

  function handleAiRetry() {
    setAiResult(null);
    setEditMode("ai-prompt");
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (loadError) {
    return (
      <div className="p-4 text-sm text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md m-4">
        Failed to load flow XML: {loadError}
      </div>
    );
  }
  if (xml === null) {
    return <div className="p-4 text-sm text-[#afb8c1] italic">Loading flow XML…</div>;
  }

  const isView = editMode === "view";
  const isManual = editMode === "manual";
  const isAiPrompt = editMode === "ai-prompt";
  const isAiLoading = editMode === "ai-loading";
  const isAiReview = editMode === "ai-review";

  return (
    <div className="p-4 space-y-2 flex flex-col flex-1 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-mono text-[#656d76] flex-1 break-all">{fileName}</span>

        {/* View mode — show edit buttons (disabled when locked) */}
        {isView && (
          <>
            <CopyButton value={xml} />
            {isLocked && (
              canUnlock ? (
                <button
                  onClick={() => void handleUnlock()}
                  disabled={unlocking}
                  title={lockTooltip}
                  className="shrink-0 text-[#bf8700] hover:text-[#953800] rounded-md p-1 transition-colors disabled:opacity-40"
                >
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 4a2.5 2.5 0 1 0-5 0v2h5Z" clipRule="evenodd" />
                  </svg>
                </button>
              ) : (
                <span title={lockTooltip} className="shrink-0 text-[#bf8700] p-1">
                  <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                    <path fillRule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 4a2.5 2.5 0 1 0-5 0v2h5Z" clipRule="evenodd" />
                  </svg>
                </span>
              )
            )}
            <button
              onClick={handleStartManualEdit}
              disabled={isLocked}
              title={isLocked ? (flowEntry?.lockedBy ? `Locked by ${flowEntry.lockedBy.name}` : "Locked") : "Manual edit"}
              className="shrink-0 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] rounded-md p-1 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
            <button
              onClick={handleStartAiEdit}
              disabled={isLocked}
              title={isLocked ? (flowEntry?.lockedBy ? `Locked by ${flowEntry.lockedBy.name}` : "Locked") : "AI Edit"}
              className="shrink-0 text-[#656d76] hover:text-[#8250df] hover:bg-[#fbefff] rounded-md p-1 transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </button>
          </>
        )}

        {/* Manual edit mode — cancel + save */}
        {isManual && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] disabled:opacity-40 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-2.5 py-1 transition-colors flex items-center gap-1.5"
            >
              {saving && <SpinnerIcon />}
              {saving ? "Saving…" : "Validate & Save"}
            </button>
          </div>
        )}

        {/* AI prompt / loading mode — cancel */}
        {(isAiPrompt || isAiLoading) && (
          <button
            onClick={handleCancelEdit}
            className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] transition-colors"
          >
            Cancel
          </button>
        )}

        {/* AI review mode — retry, edit manually, accept */}
        {isAiReview && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancelEdit}
              disabled={saving}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] disabled:opacity-40 transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleAiRetry}
              disabled={saving}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] disabled:opacity-40 transition-colors"
            >
              Retry
            </button>
            <button
              onClick={handleAiEditManually}
              disabled={saving}
              className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-2.5 py-1 hover:bg-[#f6f8fa] disabled:opacity-40 transition-colors"
            >
              Edit manually
            </button>
            <button
              onClick={handleAiAccept}
              disabled={saving}
              className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a6f2f] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-2.5 py-1 transition-colors flex items-center gap-1.5"
            >
              {saving && <SpinnerIcon />}
              {saving ? "Saving…" : "Validate & Save"}
            </button>
          </div>
        )}
      </div>

      {/* AI prompt input */}
      {(isAiPrompt || isAiLoading) && (
        <div className="shrink-0 border border-[#d6d8de] rounded-md bg-[#f6f8fa] p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#8250df]">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
            </svg>
            AI Edit
          </div>
          <textarea
            ref={promptRef}
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleAiGenerate(); }}
            disabled={isAiLoading}
            placeholder="Describe changes… e.g. &quot;Add an assertion to check data.title is not empty&quot;"
            rows={3}
            className="w-full text-sm border border-[#d1d9e0] rounded-md px-3 py-2 bg-white placeholder-[#afb8c1] focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none resize-none disabled:opacity-60"
          />
          {aiError && (
            <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
              {aiError}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-[#656d76]">{isAiLoading ? "" : "Ctrl+Enter to send"}</span>
            {isAiLoading ? (
              <button
                onClick={() => { abortRef.current?.abort(); abortRef.current = null; setEditMode("ai-prompt"); }}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={() => void handleAiGenerate()}
                disabled={!aiPrompt.trim()}
                className="text-sm font-medium text-white bg-[#8250df] hover:bg-[#7340c9] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                Generate
              </button>
            )}
          </div>
        </div>
      )}

      {/* AI review — diff info and cost */}
      {isAiReview && aiResult && (
        <div className="shrink-0 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#ddf4ff] border border-[#54aeff66] rounded-md text-sm text-[#0969da]">
            <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
            </svg>
            <span className="flex-1">Review the AI changes below. Green = added, red = removed.</span>
            {aiCost && <span className="text-xs text-[#656d76] shrink-0">{aiCost}</span>}
          </div>
        </div>
      )}

      {/* Validation error */}
      {validationError && (
        <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f] shrink-0">
          {validationError}
        </div>
      )}

      {/* Save success */}
      {saveSuccess && isView && (
        <div className="px-3 py-2 bg-[#dafbe1] border border-[#aceebb] rounded-md text-sm text-[#1a7f37] flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Saved and scenario re-created successfully
        </div>
      )}

      {/* XML viewer / editor / diff */}
      <div className="border border-[#d1d9e0] rounded-md overflow-hidden bg-white flex-1 min-h-0 flex flex-col">
        {isManual ? (
          <Suspense fallback={<div className="p-4 text-sm text-[#afb8c1]">Loading editor…</div>}>
            <XmlEditor value={draft} onChange={handleDraftChange} height="100%" />
          </Suspense>
        ) : isAiReview && aiResult ? (
          <XmlDiffView original={xml} modified={aiResult} />
        ) : (
          <XmlCodeBlock value={xml} className="flex-1 min-h-0 overflow-auto" height="100%" />
        )}
      </div>
    </div>
  );
}

/** Small spinner icon for buttons */
function SpinnerIcon() {
  return (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
    </svg>
  );
}

// XmlDiffView and computeLineDiff moved to ../common/XmlDiffView.tsx

export function DetailPane({ testId, onClose }: DetailPaneProps) {
  const [activeTab, setActiveTab] = useState<Tab>("design");
  const result = useRunnerStore((s) => testId ? s.testResults[testId] : undefined);
  const def = testId ? getTest(testId) : undefined;

  // Reset to Design tab when a different test is selected
  useEffect(() => {
    setActiveTab("design");
  }, [testId]);

  // Auto-switch to Run tab when test finishes
  useEffect(() => {
    const s = result?.status;
    if (s && s !== "idle" && s !== "running") {
      setActiveTab("run");
    }
  }, [result?.status]);

  // Empty state — always show the panel shell with a header
  if (!testId || !def) {
    return (
      <div className="bg-white flex flex-col h-full overflow-hidden w-full">
        {/* Title row — aligns with LHS h-10 */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-sm font-semibold text-[#1f2328]">Detail</span>
        </div>
        {/* Placeholder row — aligns with LHS h-9 toolbar */}
        <div className="flex items-center px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0" />
        <div className="flex-1 flex items-center justify-center text-sm text-[#afb8c1]">
          Select a scenario to view details
        </div>
      </div>
    );
  }

  const status: TestStatus = result?.status ?? "idle";
  const badge = statusBadge[status];

  return (
    <div className="bg-white flex flex-col h-full overflow-hidden w-full">

      {/* ── Title row — aligns with LHS h-10 ── */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${methodColor[safeStr(def.method)] ?? "text-[#656d76] bg-[#eef1f6]"}`}>
          {safeStr(def.method)}
        </span>
        <span className="flex-1 text-sm font-semibold text-[#1f2328] truncate" title={safeStr(def.name)}>
          {safeStr(def.name)}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
          {safeStr(badge.icon)} {safeStr(badge.label)}
        </span>
        <button
          onClick={onClose}
          className="text-[#afb8c1] hover:text-[#656d76] text-base leading-none shrink-0 ml-1"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* ── Tabs row — aligns with LHS h-9 toolbar ── */}
      <div className="flex items-center gap-1 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        {((["design", "run", ...(def.flowFileName ? ["xml"] : []), ...((status === "fail" || status === "error") ? ["diagnose"] : [])]) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-[13px] font-semibold border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[#fd8c73] text-[#1f2328]"
                : "border-transparent text-[#656d76] hover:text-[#1f2328]"
            }`}
          >
            {tab === "xml" ? "Flow XML" : tab === "diagnose" ? (
              <span className="flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                Diagnose
              </span>
            ) : <span className="capitalize">{tab}</span>}
            {tab === "run" && status !== "idle" && (
              <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                status === "pass" ? "bg-[#1a7f37]" : status === "running" ? "bg-[#0969da]" : "bg-[#d1242f]"
              }`} />
            )}
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      {activeTab === "xml" && def.flowFileName ? (
        <div className="flex-1 flex flex-col overflow-hidden">
          <FlowXmlTab fileName={def.flowFileName} />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {activeTab === "design" && <DesignTab testId={testId} />}
          {activeTab === "run" && <RunTab testId={testId} onDiagnose={() => setActiveTab("diagnose")} />}
          {activeTab === "diagnose" && <DiagnoseTab testId={testId} />}
        </div>
      )}
    </div>
  );
}
