import { useRunnerStore } from "../../store/runner.store";
import { useBreakpointsStore } from "../../store/breakpoints.store";
import { ContextMenu } from "../common/ContextMenu";
import { StatusIcon } from "./StatusIcon";
import type { TestDef } from "../../types/test.types";

interface OperationNodeProps {
  test: TestDef;
}

// 16x16 pause icon — two filled bars, matches GitHub's filled style.
const pauseIcon = (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
    <rect x="4" y="3" width="3" height="10" rx="0.5" />
    <rect x="9" y="3" width="3" height="10" rx="0.5" />
  </svg>
);

const methodColor: Record<string, string> = {
  GET: "text-[#1a7f37] bg-[#dafbe1] border-[#aceebb]",
  POST: "text-[#0969da] bg-[#ddf4ff] border-[#b6e3ff]",
  PATCH: "text-[#9a6700] bg-[#fff8c5] border-[#f5e0a0]",
  PUT: "text-[#bc4c00] bg-[#fff1e5] border-[#ffd8b5]",
  DELETE: "text-[#d1242f] bg-[#ffebe9] border-[#ffcecb]",
};

export function OperationNode({ test }: OperationNodeProps) {
  const { testResults, selectedTests, selectedTestId, selectSingleTest, selectTest } = useRunnerStore();
  // Subscribe to the breakpoints set so toggling re-renders this row.
  const breakpointIds = useBreakpointsStore((s) => s.ids);
  const toggleBreakpoint = useBreakpointsStore((s) => s.toggle);
  const result = testResults[test.id];
  const status = result?.status ?? "idle";
  const isSelected = selectedTests.has(test.id);
  const isPaneOpen = selectedTestId === test.id;
  const hasBreakpoint = breakpointIds.has(test.id);
  const isTeardown = !!test.isTeardown;

  function handleClick() {
    if (isPaneOpen) {
      selectTest(null);
    } else {
      selectSingleTest(test.id);
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-[13px] ml-1 ${
        isPaneOpen
          ? "bg-[#ddf4ff] border border-[#b6e3ff]"
          : isSelected
          ? "bg-[#ddf4ff]/50 border border-[#b6e3ff]/60"
          : "hover:bg-[#f6f8fa] border border-transparent"
      }`}
    >
      <StatusIcon status={status} />
      <span className={`font-mono px-1.5 py-px rounded text-[11px] font-semibold border text-center w-[52px] shrink-0 ${methodColor[test.method] ?? "text-[#656d76] bg-[#eef1f6] border-[#d1d9e0]"}`}>
        {test.method}
      </span>
      <span className="flex-1 text-[#1f2328] truncate">{test.name}</span>
      {hasBreakpoint && (
        <span
          className="text-[#bf8700] shrink-0"
          title="Breakpoint set — runner will pause before this step"
        >
          {pauseIcon}
        </span>
      )}
      {result?.durationMs !== undefined && (
        <span className="text-[#afb8c1] shrink-0">{result.durationMs}ms</span>
      )}
      <div
        className={`shrink-0 transition-opacity ${hasBreakpoint ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        onClick={(e) => e.stopPropagation()}
      >
        <ContextMenu
          items={[
            {
              label: hasBreakpoint ? "Remove breakpoint" : "Pause before this step",
              icon: pauseIcon,
              onClick: () => toggleBreakpoint(test.id),
              disabled: isTeardown,
              tooltip: isTeardown ? "Teardown steps cannot be paused" : undefined,
            },
          ]}
        />
      </div>
    </div>
  );
}
