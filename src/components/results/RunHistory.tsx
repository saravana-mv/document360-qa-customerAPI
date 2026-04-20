import { useCallback, useEffect, useState } from "react";
import { listTestRuns, deleteTestRun, getTestRun, type TestRunListItem } from "../../lib/api/testRunsApi";
import { useRunnerStore, type HistoryRunMeta } from "../../store/runner.store";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RunHistory() {
  const [runs, setRuns] = useState<TestRunListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingRunId, setLoadingRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listTestRuns(50);
      setRuns(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteTestRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      console.error("Failed to delete run:", err);
    }
  }

  async function handleViewRun(run: TestRunListItem) {
    setLoadingRunId(run.id);
    try {
      const full = await getTestRun(run.id);
      const meta: HistoryRunMeta = {
        runId: run.id,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        triggeredBy: run.triggeredBy?.name ?? "Unknown",
        source: run.source,
        scenarioName: run.scenarioName,
      };
      useRunnerStore.getState().loadHistoryRun(meta, {
        testResults: full.testResults ?? {},
        tagResults: full.tagResults ?? {},
        log: full.log ?? [],
        summary: full.summary,
      });
      // Switch to Scenarios tab
      window.dispatchEvent(new CustomEvent("view-history-run"));
    } catch (e) {
      console.error("Failed to load run:", e);
    } finally {
      setLoadingRunId(null);
    }
  }

  if (loading) {
    return <div className="p-4 text-sm text-[#59636e]">Loading run history...</div>;
  }

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-[#d1242f]">{error}</p>
        <button onClick={load} className="mt-2 text-sm text-[#0969da] hover:underline">Retry</button>
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-[#d1d9e0] bg-[#f6f8fa]">
          <span className="text-xs font-medium text-[#656d76]">0 runs</span>
          <div className="flex-1" />
          <RefreshButton loading={false} onClick={load} />
        </div>
        <div className="p-4 text-sm text-[#59636e]">No runs yet. Run some scenarios to see history here.</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <span className="text-xs font-medium text-[#656d76]">{runs.length} runs</span>
        <span className="text-[10px] text-[#8b949e]">Click a row to view results</span>
        <div className="flex-1" />
        <RefreshButton loading={loading} onClick={load} />
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#f6f8fa] border-b border-[#d1d9e0]">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-[#1f2328]">Date</th>
              <th className="text-left px-3 py-2 font-medium text-[#1f2328]">Source</th>
              <th className="text-left px-3 py-2 font-medium text-[#1f2328]">Triggered by</th>
              <th className="text-center px-3 py-2 font-medium text-[#1f2328]">Total</th>
              <th className="text-center px-3 py-2 font-medium text-[#1a7f37]">Pass</th>
              <th className="text-center px-3 py-2 font-medium text-[#d1242f]">Fail</th>
              <th className="text-center px-3 py-2 font-medium text-[#59636e]">Skip</th>
              <th className="text-right px-3 py-2 font-medium text-[#1f2328]">Duration</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => handleViewRun(run)}
                className="border-b border-[#d1d9e0] hover:bg-[#ddf4ff]/40 cursor-pointer transition-colors"
              >
                <td className="px-3 py-2 text-[#1f2328]">
                  {loadingRunId === run.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 animate-spin text-[#0969da]" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      {formatDate(run.startedAt)}
                    </span>
                  ) : formatDate(run.startedAt)}
                </td>
                <td className="px-3 py-2">
                  {run.source === "api" ? (
                    <span
                      className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fbefff] text-[#8250df]"
                      title={run.apiKeyName ? `API Key: ${run.apiKeyName}` : undefined}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                      </svg>
                      API
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#ddf4ff] text-[#0969da]">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                      </svg>
                      UI
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-[#59636e]">
                  {run.triggeredBy?.name ?? "Unknown"}
                  {run.source === "api" && run.scenarioName && (
                    <span className="block text-[10px] text-[#8b949e] truncate max-w-[200px]" title={run.scenarioName}>
                      {run.scenarioName}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">{run.summary?.total ?? 0}</td>
                <td className="px-3 py-2 text-center text-[#1a7f37]">{run.summary?.pass ?? 0}</td>
                <td className="px-3 py-2 text-center text-[#d1242f]">{run.summary?.fail ?? 0}</td>
                <td className="px-3 py-2 text-center text-[#59636e]">{run.summary?.skip ?? 0}</td>
                <td className="px-3 py-2 text-right">{run.summary ? formatDuration(run.summary.durationMs) : "–"}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    onClick={(e) => handleDelete(e, run.id)}
                    className="text-[#59636e] hover:text-[#d1242f] p-1"
                    title="Delete run"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RefreshButton({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f4] transition-colors disabled:opacity-40"
      title="Refresh"
    >
      <svg
        className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182M20.015 4.356v4.992" />
      </svg>
    </button>
  );
}
