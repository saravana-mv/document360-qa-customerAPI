import { useState, useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { StatusIcon } from "./StatusIcon";
import { OperationNode } from "./OperationNode";
import { useExplorerContext } from "./ExplorerContext";
import type { ParsedTag } from "../../types/spec.types";
import type { TestDef } from "../../types/test.types";

interface TagNodeProps {
  tag: ParsedTag;
  tests: TestDef[];
}

export function TagNode({ tag, tests }: TagNodeProps) {
  const [open, setOpen] = useState(false);
  const { tagResults, selectedTags, toggleFlowSelection } = useRunnerStore();
  const { expandSignal, expandAll } = useExplorerContext();
  const tagResult = tagResults[tag.name];
  const status = tagResult?.status ?? "idle";
  const isSelected = selectedTags.has(tag.name);

  useEffect(() => {
    if (expandSignal > 0) setOpen(expandAll);
  }, [expandSignal]);

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-gray-400 hover:text-gray-600 w-4 text-center text-xs shrink-0"
        >
          {open ? "▾" : "▸"}
        </button>
        <div
          onClick={() => toggleFlowSelection(tag.name, tests.map((t) => t.id))}
          className={`flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
            isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
          }`}
        >
          <span className="text-gray-400 text-sm">📁</span>
          <StatusIcon status={status} />
          <span className="font-medium text-sm text-gray-800 truncate">{tag.name}</span>
          <span className="text-xs text-gray-400 ml-auto shrink-0">
            {tests.length} test{tests.length !== 1 ? "s" : ""}
          </span>
          {tagResult?.durationMs !== undefined && (
            <span className="text-xs text-gray-400 shrink-0">{tagResult.durationMs}ms</span>
          )}
        </div>
      </div>

      {open && tests.length > 0 && (
        <div className="mt-0.5 ml-5 space-y-0.5">
          {tests.map((t) => (
            <OperationNode key={t.id} test={t} />
          ))}
        </div>
      )}

      {open && tests.length === 0 && (
        <div className="ml-7 px-2 py-1 text-xs text-gray-400 italic">No tests</div>
      )}
    </div>
  );
}
