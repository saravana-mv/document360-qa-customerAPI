import { useRunnerStore } from "../../store/runner.store";
import { TagSummaryRow } from "./TagSummaryRow";

export function SummaryDrawer() {
  const { summary, tagResults } = useRunnerStore();

  return (
    <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
      {summary ? (
        <div className="flex items-center gap-6 text-sm">
          <span className="text-gray-500">Total: <strong>{summary.total}</strong></span>
          <span className="text-green-600">Pass: <strong>{summary.pass}</strong></span>
          {summary.fail > 0 && <span className="text-red-500">Fail: <strong>{summary.fail}</strong></span>}
          {summary.skip > 0 && <span className="text-gray-400">Skip: <strong>{summary.skip}</strong></span>}
          <span className="text-gray-400 ml-auto text-xs">{summary.durationMs}ms total</span>
        </div>
      ) : (
        <div className="flex items-center gap-6 text-xs text-gray-400">
          {Object.values(tagResults).map((tr) => (
            <TagSummaryRow key={tr.tag} tagResult={tr} />
          ))}
          {Object.keys(tagResults).length === 0 && <span>No results yet</span>}
        </div>
      )}
    </div>
  );
}
