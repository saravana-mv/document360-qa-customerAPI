import { useRunnerStore } from "../../store/runner.store";
import { RunControls } from "../runner/RunControls";
import { LiveLog } from "../runner/LiveLog";
import { StatusIcon } from "../explorer/StatusIcon";

export function ResultsPanel() {
  const { testResults } = useRunnerStore();
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
              <div key={t.testId} className="flex items-center gap-3 px-3 py-2 bg-white rounded-lg border border-gray-200 text-xs">
                <StatusIcon status={t.status} />
                <span className="font-mono text-gray-500 text-xs">{t.method}</span>
                <span className="flex-1 text-gray-700">{t.testName}</span>
                {t.httpStatus && <span className="text-gray-400">{t.httpStatus}</span>}
                {t.durationMs !== undefined && <span className="text-gray-400">{t.durationMs}ms</span>}
                {t.failureReason && (
                  <span className="text-red-500 truncate max-w-xs" title={t.failureReason}>
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
