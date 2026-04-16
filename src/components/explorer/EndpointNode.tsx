import { useState } from "react";
import type { ParsedEndpoint } from "../../types/spec.types";
import type { TestDef } from "../../types/test.types";
import { OperationNode } from "./OperationNode";

interface EndpointNodeProps {
  endpoint: ParsedEndpoint;
  tests: TestDef[];
}

const methodColor: Record<string, string> = {
  GET: "text-[#1a7f37]",
  POST: "text-[#0969da]",
  PATCH: "text-[#9a6700]",
  PUT: "text-[#bc4c00]",
  DELETE: "text-[#d1242f]",
};

export function EndpointNode({ endpoint, tests }: EndpointNodeProps) {
  const [open, setOpen] = useState(false);
  const hasTests = tests.length > 0;

  return (
    <div className="ml-2">
      <div
        onClick={() => hasTests && setOpen((o) => !o)}
        className={`flex items-center gap-2 px-2 py-1 rounded-md text-[13px] ${hasTests ? "cursor-pointer hover:bg-[#f6f8fa]" : "opacity-50"}`}
      >
        <span className={`font-semibold font-mono ${methodColor[endpoint.method] ?? "text-[#656d76]"}`}>
          {endpoint.method}
        </span>
        <span className="text-[#656d76] font-mono truncate">{endpoint.path}</span>
        {!hasTests && <span className="text-[#afb8c1] text-xs">(no scenarios)</span>}
        {hasTests && (
          <svg className={`w-3 h-3 text-[#656d76] ml-auto transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        )}
      </div>
      {open && hasTests && (
        <div className="mt-px space-y-px">
          {tests.map((t) => <OperationNode key={t.id} test={t} />)}
        </div>
      )}
    </div>
  );
}
