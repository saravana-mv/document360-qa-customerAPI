import { useState, useEffect, lazy, Suspense } from "react";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { XmlCodeBlock } from "../common/XmlCodeBlock";
import { useRunnerStore } from "../../store/runner.store";
import { useSpecStore } from "../../store/spec.store";
import { useSetupStore } from "../../store/setup.store";
import { getTest } from "../../lib/tests/registry";
import { rewriteApiVersion } from "../../lib/tests/flowXml/builder";
import { getFlowFileContent, saveFlowFile } from "../../lib/api/flowFilesApi";
import { validateFlowXml } from "../../lib/tests/flowXml/validate";
import { loadFlowsFromQueue } from "../../lib/tests/flowXml/loader";
import { activateFlow } from "../../lib/tests/flowXml/activeTests";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import type { TestStatus } from "../../types/test.types";

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

function DesignTab({ testId }: { testId: string }) {
  const def = getTest(testId);
  const { selectedProjectId, selectedVersionId, apiVersion } = useSetupStore();
  if (!def) return null;

  // Rewrite the leading /vN/ to the currently-selected API version so the
  // preview matches what the runner will actually hit.
  const displayPath = rewriteApiVersion(def.path, apiVersion);
  const pathTokens = displayPath.match(/\{[^}]+\}/g) ?? [];

  // Ctx param values resolved from setup store (fallback for params without explicit metadata)
  const ctxParamValues: Record<string, string> = {
    "{id}":         selectedProjectId || "(not configured)",
    "{projectId}":  selectedProjectId || "(not configured)",
    "{project_id}": selectedProjectId || "(not configured)",
    "{versionId}":  selectedVersionId || "(not configured)",
    "{version_id}": selectedVersionId || "(not configured)",
  };

  // Build resolved URL — ctx params get real values, state params keep their template string
  const resolvedPath = pathTokens.reduce((path, token) => {
    const paramName = token.slice(1, -1);
    const meta = def.pathParamsMeta?.[paramName];
    const replacement = meta ? meta.value : (ctxParamValues[token] ?? token);
    return path.replace(token, replacement);
  }, displayPath);

  return (
    <div className="p-4 space-y-5 text-sm">

      {def.description && (
        <div className="text-xs text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff] rounded-md px-3 py-2">
          {def.description}
        </div>
      )}

      {/* Endpoint */}
      <div>
        <Label>Endpoint</Label>
        <div className="flex items-center gap-1.5 group/ep font-mono text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
          <span className={`font-bold mr-1 shrink-0 ${methodColor[def.method]?.split(" ")[0] ?? "text-[#656d76]"}`}>
            {def.method}
          </span>
          <span className="break-all flex-1">{displayPath}</span>
          <CopyButton value={`${def.method} ${displayPath}`} className="opacity-0 group-hover/ep:opacity-100 transition-opacity" />
        </div>
      </div>

      {/* Path Parameters */}
      {pathTokens.length > 0 && (
        <div>
          <Label>Path Parameters</Label>
          <div className="space-y-2">
            {pathTokens.map((token) => {
              const paramName = token.slice(1, -1);
              const meta = def.pathParamsMeta?.[paramName];
              const isStateBased = !!meta;
              const displayValue = meta ? meta.value : (ctxParamValues[token] ?? "(not configured)");
              const missing = displayValue === "(not configured)";

              return (
                <div key={token} className="text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Param token */}
                    <span className="font-mono text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff] px-2 py-0.5 rounded shrink-0">
                      {token}
                    </span>
                    <span className="text-[#afb8c1]">→</span>
                    {/* Value — with tooltip if state-based */}
                    {meta?.tooltip ? (
                      <Tooltip text={meta.tooltip}>
                        <span className="font-mono text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff] px-2 py-0.5 rounded cursor-help underline decoration-dotted underline-offset-2">
                          {displayValue}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className={`font-mono px-2 py-0.5 rounded ${
                        missing
                          ? "text-[#9a6700] italic"
                          : "text-[#1f2328] bg-[#eef1f6]"
                      }`}>
                        {displayValue}
                      </span>
                    )}
                    {!missing && <CopyButton value={displayValue} />}
                    {isStateBased && (
                      <span className="text-[11px] text-[#656d76] italic">runtime</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Resolved URL preview */}
          <div className="mt-2.5 flex items-center gap-1.5 group/url font-mono text-xs text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2">
            <span className="text-[#afb8c1] mr-0.5 shrink-0">→</span>
            <span className="break-all flex-1">{resolvedPath}</span>
            <CopyButton value={resolvedPath} className="opacity-0 group-hover/url:opacity-100 transition-opacity" />
          </div>
        </div>
      )}

      {/* Query Parameters */}
      {def.queryParams && Object.keys(def.queryParams).length > 0 && (
        <div>
          <Label>Query Parameters</Label>
          <div className="space-y-1">
            {Object.entries(def.queryParams).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2 text-xs py-0.5 group/qp">
                <span className="font-mono text-[#0969da] bg-[#ddf4ff] border border-[#b6e3ff] px-2 py-0.5 rounded shrink-0">
                  {k}
                </span>
                <span className="text-[#afb8c1]">=</span>
                <span className="font-mono text-[#1f2328] flex-1">{v}</span>
                <CopyButton value={`${k}=${v}`} className="opacity-0 group-hover/qp:opacity-100 transition-opacity" />
              </div>
            ))}
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
                <span className="flex-1">{a.description}</span>
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
        <div><span className="font-medium text-[#656d76]">Flow:</span> {def.tag}</div>
        {def.entity && <div><span className="font-medium text-[#656d76]">Entity:</span> {def.entity}</div>}
        <div className="flex items-center gap-1.5 group/id">
          <span className="font-medium text-[#656d76]">Test ID:</span>
          <span className="font-mono">{def.id}</span>
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

// ── Run Tab ──────────────────────────────────────────────────────────────────

function RunTab({ testId }: { testId: string }) {
  const result = useRunnerStore((s) => s.testResults[testId]);
  const status = result?.status ?? "idle";

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-[#afb8c1] gap-2">
        <span className="text-3xl">○</span>
        <span className="text-sm">Not run yet</span>
        <span className="text-xs">Run the test to see results here</span>
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
            <JsonBlock value={result.stateSnapshot} />
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

type Tab = "design" | "run" | "xml";

// ── Flow XML Tab ─────────────────────────────────────────────────────────────

function FlowXmlTab({ fileName }: { fileName: string }) {
  const [xml, setXml] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const { setSpec } = useSpecStore();

  useEffect(() => {
    let cancelled = false;
    setXml(null);
    setLoadError(null);
    setEditing(false);
    setSaveSuccess(false);
    getFlowFileContent(fileName)
      .then((content) => { if (!cancelled) setXml(content); })
      .catch((err) => { if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err)); });
    return () => { cancelled = true; };
  }, [fileName]);

  function handleStartEdit() {
    if (xml === null) return;
    setDraft(xml);
    setEditing(true);
    setValidationError(null);
    setSaveSuccess(false);
  }

  function handleCancelEdit() {
    setEditing(false);
    setValidationError(null);
  }

  function handleDraftChange(next: string) {
    setDraft(next);
    setValidationError(null);
    setSaveSuccess(false);
  }

  async function handleSave() {
    // Validate first
    const result = validateFlowXml(draft);
    if (!result.ok) {
      setValidationError(result.error ?? "Invalid XML");
      return;
    }

    setSaving(true);
    setValidationError(null);
    try {
      await saveFlowFile(fileName, draft, true);
      activateFlow(fileName);
      setXml(draft);
      setEditing(false);
      setSaveSuccess(true);
      // Re-register tests from the updated flow
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
  return (
    <div className="p-4 space-y-2 flex flex-col flex-1 overflow-hidden">
      {/* Header row */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="text-xs font-mono text-[#656d76] flex-1 break-all">{fileName}</span>
        {!editing && (
          <>
            <CopyButton value={xml} />
            <button
              onClick={handleStartEdit}
              title="Edit XML"
              className="shrink-0 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] rounded-md p-1 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
          </>
        )}
        {editing && (
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
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              )}
              {saving ? "Saving…" : "Validate & Save"}
            </button>
          </div>
        )}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f] shrink-0">
          {validationError}
        </div>
      )}

      {/* Save success */}
      {saveSuccess && !editing && (
        <div className="px-3 py-2 bg-[#dafbe1] border border-[#aceebb] rounded-md text-sm text-[#1a7f37] flex items-center gap-2 shrink-0">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
          </svg>
          Saved and tests re-created successfully
        </div>
      )}

      {/* XML viewer / editor */}
      <div className="border border-[#d1d9e0] rounded-md overflow-hidden bg-white flex-1 min-h-0 flex flex-col">
        {editing ? (
          <Suspense fallback={<div className="p-4 text-sm text-[#afb8c1]">Loading editor…</div>}>
            <XmlEditor value={draft} onChange={handleDraftChange} height="100%" />
          </Suspense>
        ) : (
          <XmlCodeBlock value={xml} className="flex-1 min-h-0 overflow-auto" height="100%" />
        )}
      </div>
    </div>
  );
}

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
          Select a test to view details
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
        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${methodColor[def.method] ?? "text-[#656d76] bg-[#eef1f6]"}`}>
          {def.method}
        </span>
        <span className="flex-1 text-sm font-semibold text-[#1f2328] truncate" title={def.name}>
          {def.name}
        </span>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
          {badge.icon} {badge.label}
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
        {((["design", "run", ...(def.flowFileName ? ["xml"] : [])]) as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1 text-[13px] font-semibold border-b-2 transition-colors ${
              activeTab === tab
                ? "border-[#fd8c73] text-[#1f2328]"
                : "border-transparent text-[#656d76] hover:text-[#1f2328]"
            }`}
          >
            {tab === "xml" ? "Flow XML" : <span className="capitalize">{tab}</span>}
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
          {activeTab === "run" && <RunTab testId={testId} />}
        </div>
      )}
    </div>
  );
}
