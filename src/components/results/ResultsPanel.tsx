import { useRunnerStore } from "../../store/runner.store";
import { RunControls } from "../runner/RunControls";
import { LiveLog } from "../runner/LiveLog";
import { StatusIcon } from "../explorer/StatusIcon";

const methodColor: Record<string, string> = {
  GET: "text-green-700",
  POST: "text-blue-700",
  PATCH: "text-yellow-700",
  PUT: "text-orange-700",
  DELETE: "text-red-700",
};

export function ResultsPanel() {
  const { testResults, selectedTestId, selectTest } = useRunnerStore();
  const completedTests = Object.values(testResults).filter(
    (t) => t.status !== "idle" && t.status !== "running"
  );

  return (
    <div className="flex flex-col h-full">
      <RunControls />
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-4">
        <LiveLog />
        {completedTests.length > 0 && (
          <div className="overflow-y-auto max-h-64 space-y-1">
            {completedTests.map((t) => (
              <div
                key={t.testId}
                onClick={() => selectTest(selectedTestId === t.testId ? null : t.testId)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors ${
                  selectedTestId === t.testId
                    ? "bg-blue-50 border-blue-300"
                    : "bg-white border-gray-200 hover:bg-gray-50"
                }`}
              >
                <StatusIcon status={t.status} />
                <span className={`font-mono font-bold text-xs ${methodColor[t.method] ?? "text-gray-500"}`}>{t.method}</span>
                <span className="flex-1 text-gray-700 truncate">{t.testName}</span>
                {t.httpStatus && <span className="text-gray-400">{t.httpStatus}</span>}
                {t.durationMs !== undefined && <span className="text-gray-400 shrink-0">{t.durationMs}ms</span>}
                {t.failureReason && (
                  <span className="text-red-500 truncate max-w-[140px]" title={t.failureReason}>
                    {t.failureReason}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
