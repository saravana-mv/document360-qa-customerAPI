import { useState } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { StatusIcon } from "./StatusIcon";
import { EndpointNode } from "./EndpointNode";
import type { ParsedTag } from "../../types/spec.types";
import type { TestDef } from "../../types/test.types";

interface TagNodeProps {
  tag: ParsedTag;
  tests: TestDef[];
}

export function TagNode({ tag, tests }: TagNodeProps) {
  const [open, setOpen] = useState(true);
  const { tagResults, selectedTags, toggleTagSelection } = useRunnerStore();
  const tagResult = tagResults[tag.name];
  const status = tagResult?.status ?? "idle";
  const isSelected = selectedTags.has(tag.name);

  // Group tests by path+method
  const testsByEndpoint = new Map<string, TestDef[]>();
  for (const t of tests) {
    const key = `${t.method}:${t.path}`;
    if (!testsByEndpoint.has(key)) testsByEndpoint.set(key, []);
    testsByEndpoint.get(key)!.push(t);
  }

  return (
    <div className="mb-1">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-gray-400 hover:text-gray-600 w-4 text-center text-xs"
        >
          {open ? "▾" : "▸"}
        </button>
        <div
          onClick={() => toggleTagSelection(tag.name)}
          className={`flex items-center gap-2 flex-1 px-2 py-1.5 rounded-lg cursor-pointer transition-colors ${
            isSelected ? "bg-blue-50 border border-blue-200" : "hover:bg-gray-50"
          }`}
        >
          <StatusIcon status={status} />
          <span className="font-medium text-sm text-gray-800">{tag.name}</span>
          <span className="text-xs text-gray-400 ml-auto">{tests.length} test{tests.length !== 1 ? "s" : ""}</span>
          {tagResult?.durationMs !== undefined && (
            <span className="text-xs text-gray-400">{tagResult.durationMs}ms</span>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-1 ml-6 space-y-0.5">
          {tag.endpoints.map((ep) => (
            <EndpointNode
              key={`${ep.method}:${ep.path}`}
              endpoint={ep}
              tests={testsByEndpoint.get(`${ep.method}:${ep.path}`) ?? []}
            />
          ))}
        </div>
      )}
    </div>
  );
}
