import { useRunnerStore } from "../../store/runner.store";
import { RunControls } from "../runner/RunControls";
import { LiveLog } from "../runner/LiveLog";
import { StatusIcon } from "../explorer/StatusIcon";

const methodColor: Record<string, string> = {
  GET: "text-[#1a7f37]",
  POST: "text-[#0969da]",
  PATCH: "text-[#9a6700]",
  PUT: "text-[#bc4c00]",
  DELETE: "text-[#d1242f]",
};

export function ResultsPanel() {
  const { testResults, selectedTestId, selectTest } = useRunnerStore();
  const completedTests = Object.values(testResults).filter(
    (t) => t.status !== "idle" && t.status !== "running"
  );

  return (
    <div className="flex flex-col h-full">
      <RunControls />
      <div className="flex-1 flex flex-col min-h-0 p-4 gap-3">
        <LiveLog />
        {completedTests.length > 0 && (
          <div className="overflow-y-auto max-h-64 space-y-px">
            {completedTests.map((t) => (
              <div
                key={t.testId}
                onClick={() => selectTest(selectedTestId === t.testId ? null : t.testId)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] cursor-pointer transition-colors ${
                  selectedTestId === t.testId
                    ? "bg-[#ddf4ff] border border-[#b6e3ff]"
                    : "bg-white hover:bg-[#f6f8fa] border border-[#d1d9e0]"
                }`}
              >
                <StatusIcon status={t.status} />
                <span className={`font-mono font-semibold text-[11px] ${methodColor[t.method] ?? "text-[#656d76]"}`}>{t.method}</span>
                <span className="flex-1 text-[#1f2328] truncate">{t.testName}</span>
                {t.httpStatus && <span className="text-[#656d76]">{t.httpStatus}</span>}
                {t.durationMs !== undefined && <span className="text-[#afb8c1] shrink-0">{t.durationMs}ms</span>}
                {t.failureReason && (
                  <span className="text-[#d1242f] truncate max-w-[140px]" title={t.failureReason}>
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
