import { useState } from "react";
import { SchemaTree } from "./SchemaTree";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";

interface Props {
  responses: ParsedEndpointDoc["responses"];
}

const STATUS_COLORS: Record<string, string> = {
  "2": "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  "3": "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]",
  "4": "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  "5": "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

function statusColor(status: string): string {
  return STATUS_COLORS[status[0]] ?? "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]";
}

export function ResponseTabs({ responses }: Props) {
  const [activeStatus, setActiveStatus] = useState(responses[0]?.status ?? "200");
  const active = responses.find(r => r.status === activeStatus) ?? responses[0];

  if (responses.length === 0) return null;

  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Responses</h4>
      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {responses.map(r => (
          <button
            key={r.status}
            onClick={() => setActiveStatus(r.status)}
            className={[
              "text-xs font-mono font-bold px-2 py-1 rounded border transition-colors",
              r.status === activeStatus
                ? statusColor(r.status)
                : "bg-white text-[#656d76] border-[#d1d9e0] hover:bg-[#f6f8fa]",
            ].join(" ")}
          >
            {r.status}
          </button>
        ))}
      </div>
      {/* Active response detail */}
      {active && (
        <div className="border border-[#d1d9e0] rounded-md p-3 space-y-2">
          {active.description && (
            <p className="text-sm text-[#656d76]">{active.description}</p>
          )}
          {active.contentType && (
            <p className="text-xs text-[#656d76]">
              Content-Type: <code className="bg-[#f6f8fa] px-1 rounded text-[#1f2328]">{active.contentType}</code>
            </p>
          )}
          {active.schema && (
            <SchemaTree schema={active.schema} />
          )}
          {!active.schema && !active.description && (
            <p className="text-xs text-[#656d76] italic">No response body</p>
          )}
        </div>
      )}
    </div>
  );
}
