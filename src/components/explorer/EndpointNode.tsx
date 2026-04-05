import { useState } from "react";
import type { ParsedEndpoint } from "../../types/spec.types";
import type { TestDef } from "../../types/test.types";
import { OperationNode } from "./OperationNode";

interface EndpointNodeProps {
  endpoint: ParsedEndpoint;
  tests: TestDef[];
}

const methodColor: Record<string, string> = {
  GET: "text-green-700",
  POST: "text-blue-700",
  PATCH: "text-yellow-700",
  PUT: "text-orange-700",
  DELETE: "text-red-700",
};

export function EndpointNode({ endpoint, tests }: EndpointNodeProps) {
  const [open, setOpen] = useState(false);
  const hasTests = tests.length > 0;

  return (
    <div className="ml-2">
      <div
        onClick={() => hasTests && setOpen((o) => !o)}
        className={`flex items-center gap-2 px-2 py-1 rounded text-xs ${hasTests ? "cursor-pointer hover:bg-gray-100" : "opacity-50"}`}
      >
        <span className={`font-bold font-mono ${methodColor[endpoint.method] ?? "text-gray-600"}`}>
          {endpoint.method}
        </span>
        <span className="text-gray-500 font-mono truncate">{endpoint.path}</span>
        {!hasTests && <span className="text-gray-300 text-xs">(no tests)</span>}
        {hasTests && (
          <span className="text-gray-400 ml-auto">{open ? "▾" : "▸"}</span>
        )}
      </div>
      {open && hasTests && (
        <div className="mt-0.5 space-y-0.5">
          {tests.map((t) => <OperationNode key={t.id} test={t} />)}
        </div>
      )}
    </div>
  );
}
