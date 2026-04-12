import type { TagResult } from "../../types/test.types";
import { StatusIcon } from "../explorer/StatusIcon";

interface TagSummaryRowProps {
  tagResult: TagResult;
}

export function TagSummaryRow({ tagResult }: TagSummaryRowProps) {
  const pass = tagResult.tests.filter((t) => t.status === "pass").length;
  const fail = tagResult.tests.filter((t) => t.status === "fail" || t.status === "error").length;
  const skip = tagResult.tests.filter((t) => t.status === "skip").length;
  const total = tagResult.tests.length;

  return (
    <div className="flex items-center gap-2.5 text-xs py-1">
      <StatusIcon status={tagResult.status} />
      <span className="font-medium text-[#1f2328] w-32">{tagResult.tag}</span>
      <span className="text-[#1a7f37]">{pass} pass</span>
      {fail > 0 && <span className="text-[#d1242f]">{fail} fail</span>}
      {skip > 0 && <span className="text-[#656d76]">{skip} skip</span>}
      <span className="text-[#afb8c1] text-[11px]">/ {total}</span>
      {tagResult.durationMs !== undefined && (
        <span className="ml-auto text-[11px] text-[#afb8c1]">{tagResult.durationMs}ms</span>
      )}
    </div>
  );
}
