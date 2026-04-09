import { useRunnerStore } from "../../store/runner.store";
import { StatusIcon } from "./StatusIcon";
import type { TestDef } from "../../types/test.types";

interface OperationNodeProps {
  test: TestDef;
}

const methodColor: Record<string, string> = {
  GET: "text-green-700 bg-green-50",
  POST: "text-blue-700 bg-blue-50",
  PATCH: "text-yellow-700 bg-yellow-50",
  PUT: "text-orange-700 bg-orange-50",
  DELETE: "text-red-700 bg-red-50",
};

export function OperationNode({ test }: OperationNodeProps) {
  const { testResults, selectedTests, selectedTestId, selectSingleTest, selectTest } = useRunnerStore();
  const result = testResults[test.id];
  const status = result?.status ?? "idle";
  const isSelected = selectedTests.has(test.id);
  const isPaneOpen = selectedTestId === test.id;

  function handleClick() {
    if (isPaneOpen) {
      // Clicking the already-open test closes the pane and deselects
      selectTest(null);
    } else {
      selectSingleTest(test.id);
    }
  }

  return (
    <div
      onClick={handleClick}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer transition-colors text-xs ml-2 ${
        isPaneOpen
          ? "bg-blue-100 border border-blue-300"
          : isSelected
          ? "bg-blue-50 border border-blue-200"
          : "hover:bg-gray-100"
      }`}
    >
      <StatusIcon status={status} />
      <span className={`font-mono px-1.5 py-0.5 rounded text-xs font-bold ${methodColor[test.method] ?? "text-gray-600 bg-gray-100"}`}>
        {test.method}
      </span>
      <span className="flex-1 text-gray-700 truncate">{test.name}</span>
      {result?.durationMs !== undefined && (
        <span className="text-gray-400 shrink-0">{result.durationMs}ms</span>
      )}
    </div>
  );
}
