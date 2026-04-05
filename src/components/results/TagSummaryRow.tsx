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
    <div className="flex items-center gap-3 text-sm py-1.5">
      <StatusIcon status={tagResult.status} />
      <span className="font-medium text-gray-800 w-32">{tagResult.tag}</span>
      <span className="text-green-600">{pass} pass</span>
      {fail > 0 && <span className="text-red-500">{fail} fail</span>}
      {skip > 0 && <span className="text-gray-400">{skip} skip</span>}
      <span className="text-gray-400 text-xs">/ {total}</span>
      {tagResult.durationMs !== undefined && (
        <span className="ml-auto text-xs text-gray-400">{tagResult.durationMs}ms</span>
      )}
    </div>
  );
}
