import { useSpecStore } from "../../store/spec.store";
import { useRunnerStore } from "../../store/runner.store";
import { getAllTests } from "../../lib/tests/registry";
import { TagNode } from "./TagNode";

export function TestExplorer() {
  const { parsedTags } = useSpecStore();
  const { selectAll, clearSelection } = useRunnerStore();
  const allTests = getAllTests();

  if (parsedTags.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-2">
        <span className="text-3xl">○</span>
        <span>No spec loaded</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tests</span>
        <div className="flex-1" />
        <button onClick={selectAll} className="text-xs text-blue-600 hover:underline">All</button>
        <span className="text-gray-300">|</span>
        <button onClick={clearSelection} className="text-xs text-gray-500 hover:underline">None</button>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
        {parsedTags.map((tag) => {
          const tests = allTests.filter((t) => t.tag === tag.name);
          return <TagNode key={tag.name} tag={tag} tests={tests} />;
        })}
      </div>
    </div>
  );
}
