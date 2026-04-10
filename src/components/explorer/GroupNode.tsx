import { useState, useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { getAllTests } from "../../lib/tests/registry";
import { TagNode } from "./TagNode";
import { useExplorerContext } from "./ExplorerContext";
import type { ParsedTag } from "../../types/spec.types";

interface GroupNodeProps {
  name: string;
  flows: ParsedTag[];
}

export function GroupNode({ name, flows }: GroupNodeProps) {
  const [open, setOpen] = useState(false);
  const allTests = getAllTests();
  const { selectedTags } = useRunnerStore();
  const { expandSignal, expandAll } = useExplorerContext();

  useEffect(() => {
    if (expandSignal > 0) setOpen(expandAll);
  }, [expandSignal]);

  const groupTests = allTests.filter((t) => flows.some((f) => f.name === t.tag));
  const selectedCount = flows.filter((f) => selectedTags.has(f.name)).length;

  return (
    <div className="mb-2">
      {/* Group accordion header */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 transition-colors text-left"
      >
        <span className="text-gray-500 text-xs w-3 text-center">{open ? "▾" : "▸"}</span>
        <span className="text-sm font-semibold text-gray-700 flex-1">{name}</span>
        <span className="text-xs text-gray-400 shrink-0">
          {groupTests.length} tests
        </span>
        {selectedCount > 0 && (
          <span className="text-xs text-blue-600 shrink-0">
            {selectedCount}/{flows.length} selected
          </span>
        )}
      </button>

      {/* Flows inside the group */}
      {open && (
        <div className="mt-1 ml-2 space-y-0.5">
          {flows.map((tag) => {
            const tests = allTests.filter((t) => t.tag === tag.name);
            return <TagNode key={tag.name} tag={tag} tests={tests} />;
          })}
        </div>
      )}
    </div>
  );
}
