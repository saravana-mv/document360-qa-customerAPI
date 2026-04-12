import { useState, useEffect } from "react";
import JsonView from "@uiw/react-json-view";
import { useRunnerStore } from "../../store/runner.store";
import { useSetupStore } from "../../store/setup.store";
import { getTest } from "../../lib/tests/registry";
import type { TestStatus } from "../../types/test.types";

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
    <p className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-1.5">
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
      <span className="absolute bottom-full left-0 mb-1.5 hidden group-hover/tip:block z-20 bg-[#1f2328] text-white text-[10px] leading-snug rounded-md px-2 py-1 whitespace-nowrap shadow-lg pointer-events-none max-w-xs">
        {text}
      </span>
    </span>
  );
}

/** JSON viewer with a copy button in the top-right corner. */
function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null)
    return <span className="text-[#afb8c1] italic text-xs">—</span>;
  const jsonStr = JSON.stringify(value, null, 2);
  return (
    <div className="relative group/json text-xs border border-[#d1d9e0] rounded-md overflow-auto max-h-56 p-2 bg-[#f6f8fa]">
      <CopyButton
        value={jsonStr}
        className="absolute top-1.5 right-1.5 opacity-0 group-hover/json:opacity-100 transition-opacity"
      />
      <JsonView value={value as object} style={{ background: "transparent", fontSize: "11px" }} />
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
  const { selectedProjectId, selectedVersionId } = useSetupStore();
  if (!def) return null;

  const pathTokens = def.path.match(/\{[^}]+\}/g) ?? [];

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
  }, def.path);

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
          <span className="break-all flex-1">{def.path}</span>
          <CopyButton value={`${def.method} ${def.path}`} className="opacity-0 group-hover/ep:opacity-100 transition-opacity" />
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
                      <span className="text-[10px] text-[#656d76] italic">runtime</span>
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
        {def.group && <div><span className="font-medium text-[#656d76]">Group:</span> {def.group}</div>}
        <div className="flex items-center gap-1.5 group/id">
          <span className="font-medium text-[#656d76]">Test ID:</span>
          <span className="font-mono">{def.id}</span>
          <CopyButton value={def.id} className="opacity-0 group-hover/id:opacity-100 transition-opacity" />
        </div>
      </div>
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

  return (
    <div className="p-4 space-y-5 text-sm">

      {/* Status row */}
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#f6f8fa] border border-[#d1d9e0]">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
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

      {/* Request Body */}
      {result?.requestBody !== undefined && (
        <div>
          <Label>Request Body</Label>
          <JsonBlock value={result.requestBody} />
        </div>
      )}

      {/* Response Body */}
      <div>
        <Label>Response Body</Label>
        {result?.responseBody !== undefined
          ? <JsonBlock value={result.responseBody} />
          : <p className="text-xs text-[#afb8c1] italic px-1">No content to display</p>
        }
      </div>

      {/* State Snapshot — shown for skip/fail when extra context was captured */}
      {result?.stateSnapshot !== undefined && (
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <p className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">State Snapshot</p>
            <span className="text-[10px] text-[#9a6700] bg-[#fff8c5] border border-[#f5e0a0] px-1.5 py-0.5 rounded">
              debug context
            </span>
          </div>
          <JsonBlock value={result.stateSnapshot} />
        </div>
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
  testId: string;
  onClose: () => void;
}

type Tab = "design" | "run";

export function DetailPane({ testId, onClose }: DetailPaneProps) {
  const [activeTab, setActiveTab] = useState<Tab>("design");
  const result = useRunnerStore((s) => s.testResults[testId]);
  const def = getTest(testId);

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

  if (!def) return null;

  const status: TestStatus = result?.status ?? "idle";
  const badge = statusBadge[status];

  return (
    <div className="border-l border-[#d1d9e0] bg-white flex flex-col h-full overflow-hidden w-full">

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-0 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <div className="flex items-center gap-2 mb-3">
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

        {/* ── Tabs ── */}
        <div className="flex gap-1">
          {(["design", "run"] as Tab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 text-xs font-semibold capitalize border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-[#fd8c73] text-[#1f2328]"
                  : "border-transparent text-[#656d76] hover:text-[#1f2328]"
              }`}
            >
              {tab}
              {tab === "run" && status !== "idle" && (
                <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                  status === "pass" ? "bg-[#1a7f37]" : status === "running" ? "bg-[#0969da]" : "bg-[#d1242f]"
                }`} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === "design"
          ? <DesignTab testId={testId} />
          : <RunTab testId={testId} />
        }
      </div>
    </div>
  );
}
