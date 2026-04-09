import { useRunnerStore } from "../../store/runner.store";
import { getTest } from "../../lib/tests/registry";

const methodColor: Record<string, string> = {
  GET: "text-green-700 bg-green-100",
  POST: "text-blue-700 bg-blue-100",
  PATCH: "text-yellow-700 bg-yellow-100",
  PUT: "text-orange-700 bg-orange-100",
  DELETE: "text-red-700 bg-red-100",
};

const statusColor: Record<string, string> = {
  pass: "text-green-700 bg-green-50 border-green-200",
  fail: "text-red-700 bg-red-50 border-red-200",
  error: "text-red-700 bg-red-50 border-red-200",
  skip: "text-gray-500 bg-gray-50 border-gray-200",
  running: "text-blue-700 bg-blue-50 border-blue-200",
  idle: "text-gray-400 bg-gray-50 border-gray-100",
};

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <span className="text-gray-400 italic text-xs">—</span>;
  return (
    <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-56 whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  );
}

interface DetailPaneProps {
  testId: string;
  onClose: () => void;
}

export function DetailPane({ testId, onClose }: DetailPaneProps) {
  const result = useRunnerStore((s) => s.testResults[testId]);
  const def = getTest(testId);

  // def comes from registry (always available after setup), result from store (only after run)
  if (!def) return null;

  const status = result?.status ?? "idle";
  const statusCls = statusColor[status] ?? statusColor.idle;

  // Extract path parameters from the path template
  const pathParams = (def.path.match(/\{[^}]+\}/g) ?? []);

  return (
    <div className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${methodColor[def.method] ?? "text-gray-600 bg-gray-100"}`}>
          {def.method}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate" title={def.name}>
          {def.name}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">

        {/* ── DEFINITION ── */}
        <Section title="Endpoint">
          <div className="font-mono text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
            {def.method} {def.path}
          </div>
        </Section>

        {pathParams.length > 0 && (
          <Section title="Path Parameters">
            <div className="space-y-1">
              {pathParams.map((p) => (
                <div key={p} className="flex items-center gap-2 text-xs">
                  <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">{p}</span>
                  <span className="text-gray-500">path parameter</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {def.assertions.length > 0 && (
          <Section title="Defined Assertions">
            <div className="space-y-1">
              {def.assertions.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-xs text-gray-600 px-2 py-1 bg-gray-50 rounded">
                  <span className="text-gray-400">◆</span>
                  <span>{a.description}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        <div className="border-t border-gray-100" />

        {/* ── EXECUTION RESULT ── */}
        <Section title="Last Run">
          {status === "idle" ? (
            <span className="text-xs text-gray-400 italic">Not run yet</span>
          ) : (
            <div className="space-y-4">
              {/* Status */}
              <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusCls}`}>
                <span className="font-semibold capitalize">{status}</span>
                {result?.httpStatus && <span className="font-mono text-xs">HTTP {result.httpStatus}</span>}
                {result?.durationMs !== undefined && <span className="ml-auto text-xs opacity-70">{result.durationMs}ms</span>}
              </div>

              {result?.failureReason && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                  {result.failureReason}
                </div>
              )}

              {/* Request */}
              {result?.requestUrl && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Request URL</p>
                  <div className="font-mono text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
                    {result.requestUrl}
                  </div>
                  {result.requestBody !== undefined && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 mb-1">Request Body</p>
                      <JsonBlock value={result.requestBody} />
                    </div>
                  )}
                </div>
              )}

              {/* Response */}
              {result?.responseBody !== undefined && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Response Body</p>
                  <JsonBlock value={result.responseBody} />
                </div>
              )}

              {/* Assertion results */}
              {result?.assertionResults && result.assertionResults.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-1">Assertions</p>
                  <div className="space-y-1">
                    {result.assertionResults.map((a) => (
                      <div key={a.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${a.passed ? "text-green-700" : "text-red-700"}`}>
                        <span>{a.passed ? "✓" : "✗"}</span>
                        <span>{a.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Section>

        {/* Flow / Group metadata */}
        <div className="border-t border-gray-100 pt-3 space-y-1 text-xs text-gray-400">
          <div><span className="font-medium">Flow:</span> {def.tag}</div>
          {def.group && <div><span className="font-medium">Group:</span> {def.group}</div>}
        </div>
      </div>
    </div>
  );
}
