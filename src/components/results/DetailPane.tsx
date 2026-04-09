import { useRunnerStore } from "../../store/runner.store";

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
  idle: "text-gray-400 bg-gray-50 border-gray-200",
};

function JsonBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null) return <span className="text-gray-400 italic">—</span>;
  return (
    <pre className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 overflow-auto max-h-64 whitespace-pre-wrap break-all">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
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

  if (!result) return null;

  const statusCls = statusColor[result.status] ?? statusColor.idle;

  return (
    <div className="w-96 shrink-0 border-l border-gray-200 bg-white flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 bg-gray-50 shrink-0">
        <span className={`font-mono text-xs font-bold px-2 py-0.5 rounded ${methodColor[result.method] ?? "text-gray-600 bg-gray-100"}`}>
          {result.method}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800 truncate" title={result.testName}>
          {result.testName}
        </span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-lg leading-none shrink-0"
          aria-label="Close detail pane"
        >
          ✕
        </button>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm">

        {/* Status row */}
        <div className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${statusCls}`}>
          <span className="font-semibold capitalize">{result.status}</span>
          {result.httpStatus && (
            <span className="font-mono text-xs">HTTP {result.httpStatus}</span>
          )}
          {result.durationMs !== undefined && (
            <span className="ml-auto text-xs opacity-70">{result.durationMs}ms</span>
          )}
        </div>

        {result.failureReason && (
          <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            {result.failureReason}
          </div>
        )}

        {/* Request */}
        <Section title="Request">
          {result.requestUrl ? (
            <div className="space-y-2">
              <div className="font-mono text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 break-all">
                {result.requestUrl}
              </div>
              {result.requestBody !== undefined && (
                <>
                  <p className="text-xs text-gray-500">Body</p>
                  <JsonBlock value={result.requestBody} />
                </>
              )}
            </div>
          ) : (
            <span className="text-xs text-gray-400 italic">No request details captured</span>
          )}
        </Section>

        {/* Response */}
        <Section title="Response">
          {result.responseBody !== undefined ? (
            <JsonBlock value={result.responseBody} />
          ) : (
            <span className="text-xs text-gray-400 italic">No response body</span>
          )}
        </Section>

        {/* Assertions */}
        {result.assertionResults && result.assertionResults.length > 0 && (
          <Section title="Assertions">
            <div className="space-y-1">
              {result.assertionResults.map((a) => (
                <div key={a.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded ${a.passed ? "text-green-700" : "text-red-700"}`}>
                  <span>{a.passed ? "✓" : "✗"}</span>
                  <span>{a.description}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Path template */}
        <Section title="Path Template">
          <span className="font-mono text-xs text-gray-500">{result.path}</span>
        </Section>
      </div>
    </div>
  );
}
