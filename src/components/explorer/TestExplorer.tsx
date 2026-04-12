import { useState } from "react";
import { useSpecStore } from "../../store/spec.store";
import { useRunnerStore } from "../../store/runner.store";
import { getAllTests } from "../../lib/tests/registry";
import { GroupNode } from "./GroupNode";
import { ExplorerContext } from "./ExplorerContext";
import type { ParsedTag } from "../../types/spec.types";

export function TestExplorer() {
  const { parsedTags } = useSpecStore();
  const { selectAll, clearSelection } = useRunnerStore();
  const allTests = getAllTests();

  const [expandSignal, setExpandSignal] = useState(0);
  const [expandAll, setExpandAll] = useState(false);

  function handleExpandAll() {
    setExpandAll(true);
    setExpandSignal((n) => n + 1);
  }

  function handleCollapseAll() {
    setExpandAll(false);
    setExpandSignal((n) => n + 1);
  }

  if (parsedTags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="w-8 h-8 rounded-full bg-[#eef1f6] flex items-center justify-center">
          <span className="w-3 h-3 rounded-full bg-[#d1d9e0]" />
        </span>
        <span className="text-sm text-[#656d76]">No spec loaded</span>
      </div>
    );
  }

  // Group parsedTags by test.group (fall back to "General" if not set)
  const groupMap = new Map<string, ParsedTag[]>();
  for (const tag of parsedTags) {
    const repTest = allTests.find((t) => t.tag === tag.name);
    const groupName = repTest?.group ?? "General";
    if (!groupMap.has(groupName)) groupMap.set(groupName, []);
    groupMap.get(groupName)!.push(tag);
  }
  const groups = Array.from(groupMap.entries());

  return (
    <ExplorerContext.Provider value={{ expandSignal, expandAll }}>
      <div className="flex flex-col h-full">
        <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-[13px] font-semibold text-[#1f2328]">Tests</span>
          <div className="flex-1" />
          <button onClick={handleExpandAll} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">Expand</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={handleCollapseAll} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">Collapse</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={selectAll} className="text-xs text-[#0969da] hover:underline">All</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={clearSelection} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">None</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {groups.map(([groupName, flows]) => (
            <GroupNode key={groupName} name={groupName} flows={flows} />
          ))}
        </div>
      </div>
    </ExplorerContext.Provider>
  );
}
