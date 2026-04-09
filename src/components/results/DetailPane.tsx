import { useState, useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { getTest } from "../../lib/tests/registry";
import type { TestStatus } from "../../types/test.types";

// ── Styles ─────────────────────────────────────────────────────────────────

const methodColor: Record<string, string> = {
  GET: "text-green-700 bg-green-100",
  POST: "text-blue-700 bg-blue-100",
  PATCH: "text-yellow-700 bg-yellow-100",
  PUT: "text-orange-700 bg-orange-100",
  DELETE: "text-red-700 bg-red-100",
};

const statusBadge: Record<TestStatus, { label: string; cls: string; icon: string }> = {
  idle:    { label: "Not run",  cls: "text-gray-400 bg-gray-100",               icon: "○" },
  running: { label: "Running",  cls: "text-blue-600 bg-blue-50 animate-pulse",  icon: "⟳" },
  pass:    { label: "Pass",     cls: "text-green-700 bg-green-100",              icon: "✓" },
  fail:    { label: "Fail",     cls: "text-red-600 bg-red-100",                 icon: "✗" },
  error:   { label: "Error",    cls: "text-red-600 bg-red-100",                 icon: "✗" },
  skip:    { label: "Skipped",  cls: "text-gray-500 bg-gray-100",               icon: "—" },
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null)
    return <span className="text-gray-400 italic text-xs">—</span>;
  return (
    <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">
      {children}
    </p>
  );
}

// ── Tab content ─────────────────────────────────────────────────────────────

function DesignTab({ testId }: { testId: string }) {
  const def = getTest(testId);
  if (!def) return null;

  const pathParams = def.path.match(/\{[^}]+\}/g) ?? [];

  return (
    <div className="p-4 space-y-5 text-sm">

      <div>
        <Label>Endpoint</Label>
        <div className="font-mono text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
          <span className={`font-bold mr-2 ${methodColor[def.method]?.split(" ")[0] ?? "text-gray-600"}`}>
            {def.method}
          </span>
          {def.path}
        </div>
      </div>

      {pathParams.length > 0 && (
        <div>
          <Label>Path Parameters</Label>
          <div className="space-y-1">
            {pathParams.map((p) => (
              <div key={p} className="flex items-center gap-2 text-xs py-1">
                <span className="font-mono text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded">
                  {p}
                </span>
                <span className="text-gray-400">required · path</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {def.assertions.length > 0 ? (
        <div>
          <Label>Assertions</Label>
          <div className="space-y-1">
            {def.assertions.map((a) => (
              <div key={a.id} className="flex items-start gap-2 text-xs text-gray-600 px-3 py-2 bg-gray-50 border border-gray-100 rounded-lg">
                <span className="text-gray-300 mt-0.5">◆</span>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div>
          <Label>Assertions</Label>
          <span className="text-xs text-gray-400 italic">No assertions defined</span>
        </div>
      )}

      <div className="border-t border-gray-100 pt-4 space-y-1.5 text-xs text-gray-400">
        <div><span className="font-medium text-gray-500">Flow:</span> {def.tag}</div>
        {def.group && <div><span className="font-medium text-gray-500">Group:</span> {def.group}</div>}
        <div><span className="font-medium text-gray-500">Test ID:</span> <span className="font-mono">{def.id}</span></div>
      </div>
    </div>
  );
}

function RunTab({ testId }: { testId: string }) {
  const result = useRunnerStore((s) => s.testResults[testId]);
  const status = result?.status ?? "idle";

  if (status === "idle") {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-2">
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
      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.icon} {badge.label}
        </span>
        {result?.httpStatus && (
          <span className="font-mono text-xs text-gray-500">HTTP {result.httpStatus}</span>
        )}
        {result?.durationMs !== undefined && (
          <span className="ml-auto text-xs text-gray-400">{result.durationMs}ms</span>
        )}
      </div>

      {result?.failureReason && (
        <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          <span className="font-semibold block mb-0.5">Failure reason</span>
          {result.failureReason}
        </div>
      )}

      {/* Request */}
      {result?.requestUrl && (
        <div>
          <Label>Request URL</Label>
          <div className="font-mono text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
            {result.requestUrl}
          </div>
        </div>
      )}

      {result?.requestBody !== undefined && (
        <div>
          <Label>Request Body</Label>
          <JsonBlock value={result.requestBody} />
        </div>
      )}

      {/* Response */}
      {result?.responseBody !== undefined && (
        <div>
          <Label>Response Body</Label>
          <JsonBlock value={result.responseBody} />
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
                className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
                  a.passed
                    ? "text-green-700 bg-green-50 border-green-100"
                    : "text-red-600 bg-red-50 border-red-100"
                }`}
              >
                <span className="font-bold">{a.passed ? "✓" : "✗"}</span>
                <span>{a.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

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
    <div className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="px-4 pt-3 pb-0 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded shrink-0 ${methodColor[def.method] ?? "text-gray-600 bg-gray-100"}`}>
            {def.method}
          </span>
          <span className="flex-1 text-sm font-semibold text-gray-800 truncate" title={def.name}>
            {def.name}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
            {badge.icon} {badge.label}
          </span>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-base leading-none shrink-0 ml-1"
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
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-400 hover:text-gray-600"
              }`}
            >
              {tab}
              {tab === "run" && status !== "idle" && (
                <span className={`ml-1.5 inline-block w-1.5 h-1.5 rounded-full ${
                  status === "pass" ? "bg-green-500" : status === "running" ? "bg-blue-400" : "bg-red-500"
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
