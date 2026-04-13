import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const { tagResults, selectedTags, toggleFlowSelection } = useRunnerStore();
  const { expandSignal, expandAll } = useExplorerContext();
  const tagResult = tagResults[tag.name];
  const status = tagResult?.status ?? "idle";
  const isSelected = selectedTags.has(tag.name);
  // Every test in a flow carries the same flowFileName — grab the first.
  const flowFileName = tests[0]?.flowFileName;

  useEffect(() => {
    if (expandSignal > 0) setOpen(expandAll);
  }, [expandSignal]);

  return (
    <div className="mb-px">
      <div className="group flex items-center gap-1">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-[#656d76] hover:text-[#1f2328] w-4 flex items-center justify-center shrink-0"
        >
          <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <div
          onClick={() => toggleFlowSelection(tag.name, tests.map((t) => t.id))}
          className={`flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${
            isSelected ? "bg-[#ddf4ff] border border-[#b6e3ff]" : "hover:bg-[#f6f8fa] border border-transparent"
          }`}
        >
          <svg className="w-3.5 h-3.5 text-[#9a6700] shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
          </svg>
          <StatusIcon status={status} />
          <span className="font-medium text-[13px] text-[#1f2328] truncate">{tag.name}</span>
          {flowFileName && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate("/flow", { state: { selectPath: flowFileName } });
              }}
              title="Edit flow XML in Flow Manager"
              className="shrink-0 opacity-0 group-hover:opacity-100 text-[#656d76] hover:text-[#0969da] rounded p-0.5 hover:bg-white transition-opacity"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
              </svg>
            </button>
          )}
          <span className="text-xs text-[#656d76] ml-auto shrink-0">
            {tests.length}
          </span>
          {tagResult?.durationMs !== undefined && (
            <span className="text-xs text-[#afb8c1] shrink-0">{tagResult.durationMs}ms</span>
          )}
        </div>
      </div>

      {open && tests.length > 0 && (
        <div className="mt-px ml-5 space-y-px">
          {tests.map((t) => (
            <OperationNode key={t.id} test={t} />
          ))}
        </div>
      )}

      {open && tests.length === 0 && (
        <div className="ml-7 px-2 py-1 text-xs text-[#656d76] italic">No tests</div>
      )}
    </div>
  );
}
