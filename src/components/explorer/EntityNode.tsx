import { useState, useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { getAllTests } from "../../lib/tests/registry";
import { TagNode } from "./TagNode";
import { useExplorerContext } from "./ExplorerContext";
import type { ParsedTag } from "../../types/spec.types";

interface EntityNodeProps {
  name: string;
  flows: ParsedTag[];
}

export function EntityNode({ name, flows }: EntityNodeProps) {
  const [open, setOpen] = useState(false);
  const allTests = getAllTests();
  const { selectedTags } = useRunnerStore();
  const { expandSignal, expandAll } = useExplorerContext();

  useEffect(() => {
    if (expandSignal > 0) setOpen(expandAll);
  }, [expandSignal]);

  const entityTests = allTests.filter((t) => flows.some((f) => f.name === t.tag));
  const selectedCount = flows.filter((f) => selectedTags.has(f.name)).length;

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0]/60 transition-colors text-left"
      >
        <svg className={`w-3 h-3 text-[#656d76] shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
        </svg>
        <span className="text-[13px] font-semibold text-[#1f2328] flex-1">{name}</span>
        <span className="text-xs text-[#656d76] shrink-0">
          {entityTests.length}
        </span>
        {selectedCount > 0 && (
          <span className="text-[11px] text-[#0969da] font-medium shrink-0 px-1.5 py-px rounded-full bg-[#ddf4ff] border border-[#b6e3ff]">
            {selectedCount}/{flows.length}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-0.5 ml-2 space-y-px">
          {flows.map((tag) => {
            const tests = allTests.filter((t) => t.tag === tag.name);
            return <TagNode key={tag.name} tag={tag} tests={tests} />;
          })}
        </div>
      )}
    </div>
  );
}
