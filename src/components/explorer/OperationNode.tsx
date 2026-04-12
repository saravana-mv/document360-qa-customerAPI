import { useRunnerStore } from "../../store/runner.store";
import { StatusIcon } from "./StatusIcon";
import type { TestDef } from "../../types/test.types";

interface OperationNodeProps {
  test: TestDef;
}

const methodColor: Record<string, string> = {
  GET: "text-[#1a7f37] bg-[#dafbe1] border-[#aceebb]",
  POST: "text-[#0969da] bg-[#ddf4ff] border-[#b6e3ff]",
  PATCH: "text-[#9a6700] bg-[#fff8c5] border-[#f5e0a0]",
  PUT: "text-[#bc4c00] bg-[#fff1e5] border-[#ffd8b5]",
  DELETE: "text-[#d1242f] bg-[#ffebe9] border-[#ffcecb]",
};

export function OperationNode({ test }: OperationNodeProps) {
  const { testResults, selectedTests, selectedTestId, selectSingleTest, selectTest } = useRunnerStore();
  const result = testResults[test.id];
  const status = result?.status ?? "idle";
  const isSelected = selectedTests.has(test.id);
  const isPaneOpen = selectedTestId === test.id;

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
      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md cursor-pointer transition-colors text-[13px] ml-1 ${
        isPaneOpen
          ? "bg-[#ddf4ff] border border-[#b6e3ff]"
          : isSelected
          ? "bg-[#ddf4ff]/50 border border-[#b6e3ff]/60"
          : "hover:bg-[#f6f8fa] border border-transparent"
      }`}
    >
      <StatusIcon status={status} />
      <span className={`font-mono px-1.5 py-px rounded text-[11px] font-semibold border ${methodColor[test.method] ?? "text-[#656d76] bg-[#eef1f6] border-[#d1d9e0]"}`}>
        {test.method}
      </span>
      <span className="flex-1 text-[#1f2328] truncate">{test.name}</span>
      {result?.durationMs !== undefined && (
        <span className="text-[#afb8c1] shrink-0">{result.durationMs}ms</span>
      )}
    </div>
  );
}
