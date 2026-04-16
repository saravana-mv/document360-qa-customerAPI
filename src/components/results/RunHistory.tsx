import { useCallback, useEffect, useState } from "react";
import { listTestRuns, deleteTestRun, type TestRunListItem } from "../../lib/api/testRunsApi";

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

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this run?")) return;
    try {
      await deleteTestRun(id);
      setRuns((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      console.error("Failed to delete run:", e);
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
    return <div className="p-4 text-sm text-[#59636e]">No runs yet. Run some scenarios to see history here.</div>;
  }

  return (
    <div className="overflow-auto h-full">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[#f6f8fa] border-b border-[#d1d9e0]">
          <tr>
            <th className="text-left px-3 py-2 font-medium text-[#1f2328]">Date</th>
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
            <tr key={run.id} className="border-b border-[#d1d9e0] hover:bg-[#f6f8fa]">
              <td className="px-3 py-2 text-[#1f2328]">{formatDate(run.startedAt)}</td>
              <td className="px-3 py-2 text-[#59636e]">{run.triggeredBy?.name ?? "Unknown"}</td>
              <td className="px-3 py-2 text-center">{run.summary?.total ?? 0}</td>
              <td className="px-3 py-2 text-center text-[#1a7f37]">{run.summary?.pass ?? 0}</td>
              <td className="px-3 py-2 text-center text-[#d1242f]">{run.summary?.fail ?? 0}</td>
              <td className="px-3 py-2 text-center text-[#59636e]">{run.summary?.skip ?? 0}</td>
              <td className="px-3 py-2 text-right">{run.summary ? formatDuration(run.summary.durationMs) : "–"}</td>
              <td className="px-3 py-2 text-right">
                <button
                  onClick={() => handleDelete(run.id)}
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
  );
}
