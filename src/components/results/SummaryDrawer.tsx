import { useRunnerStore } from "../../store/runner.store";
import { TagSummaryRow } from "./TagSummaryRow";

export function SummaryDrawer() {
  const { summary, tagResults } = useRunnerStore();

  return (
    <div className="border-t border-[#d1d9e0] bg-white px-4 py-2.5 shrink-0">
      {summary ? (
        <div className="flex items-center gap-5 text-[13px]">
          <span className="text-[#656d76]">Total: <strong className="text-[#1f2328]">{summary.total}</strong></span>
          <span className="text-[#1a7f37]">Pass: <strong>{summary.pass}</strong></span>
          {summary.fail > 0 && <span className="text-[#d1242f]">Fail: <strong>{summary.fail}</strong></span>}
          {summary.skip > 0 && <span className="text-[#656d76]">Skip: <strong>{summary.skip}</strong></span>}
          <span className="text-[#afb8c1] ml-auto text-[13px]">{summary.durationMs}ms total</span>
        </div>
      ) : (
        <div className="flex items-center gap-5 text-[13px] text-[#656d76]">
          {Object.values(tagResults).map((tr) => (
            <TagSummaryRow key={tr.tag} tagResult={tr} />
          ))}
          {Object.keys(tagResults).length === 0 && <span className="text-[#afb8c1]">No results yet</span>}
        </div>
      )}
    </div>
  );
}
