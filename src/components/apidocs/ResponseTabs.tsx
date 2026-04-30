import { useMemo, useState } from "react";
import { SchemaTree } from "./SchemaTree";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { generateSchemaExample } from "../../lib/spec/schemaExample";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";

interface Props {
  responses: ParsedEndpointDoc["responses"];
}

const DOT_COLORS: Record<string, string> = {
  "2": "bg-[#1a7f37]",
  "3": "bg-[#0969da]",
  "4": "bg-[#9a6700]",
  "5": "bg-[#d1242f]",
};

function dotColor(status: string): string {
  return DOT_COLORS[status[0]] ?? "bg-[#656d76]";
}

export function ResponseTabs({ responses }: Props) {
  const [activeStatus, setActiveStatus] = useState(responses[0]?.status ?? "200");
  const [showExample, setShowExample] = useState(false);
  const [schemaResetKey, setSchemaResetKey] = useState(0);
  const [schemaDefaultExpanded, setSchemaDefaultExpanded] = useState(true);
  const active = responses.find(r => r.status === activeStatus) ?? responses[0];

  const example = useMemo(() => {
    if (!active?.schema) return null;
    return generateSchemaExample(active.schema);
  }, [active]);

  if (responses.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#1f2328] pb-2 border-b border-[#d1d9e0]">Responses</h4>

      {/* Status tabs with colored dots */}
      <div className="flex items-center gap-0 border-b border-[#d1d9e0]">
        {responses.map(r => (
          <button
            key={r.status}
            onClick={() => { setActiveStatus(r.status); setShowExample(false); }}
            className={[
              "flex items-center gap-1.5 px-3 py-2 text-sm font-mono font-semibold transition-colors relative",
              r.status === activeStatus
                ? "text-[#1f2328]"
                : "text-[#656d76] hover:text-[#1f2328]",
            ].join(" ")}
          >
            <span className={`w-2 h-2 rounded-full ${dotColor(r.status)}`} />
            {r.status}
            {r.status === activeStatus && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0969da] rounded-t" />
            )}
          </button>
        ))}
      </div>

      {/* Active response content */}
      {active && (
        <div className="border border-[#d1d9e0] rounded-lg p-4 space-y-3">
          {active.description && (
            <p className="text-sm text-[#656d76]">{active.description}</p>
          )}

          {active.contentType && (
            <div className="flex items-center gap-2 text-sm text-[#656d76]">
              <span className="font-semibold">Content-Type:</span>
              <code className="text-xs bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5 text-[#1f2328]">
                {active.contentType}
              </code>
            </div>
          )}

          {active.schema && (
            <>
              {/* Toolbar */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setShowExample(v => !v)}
                  className="text-sm font-medium text-[#0969da] hover:underline"
                >
                  {showExample ? "Close Example" : "Show Example"}
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSchemaDefaultExpanded(true); setSchemaResetKey(k => k + 1); }}
                    className="text-sm text-[#656d76] hover:text-[#1f2328]"
                    title="Expand all"
                  >
                    Expand All
                  </button>
                  <span className="text-sm text-[#d1d9e0]">|</span>
                  <button
                    onClick={() => { setSchemaDefaultExpanded(false); setSchemaResetKey(k => k + 1); }}
                    className="text-sm text-[#656d76] hover:text-[#1f2328]"
                    title="Collapse all"
                  >
                    Collapse All
                  </button>
                </div>
              </div>

              {/* Schema tree */}
              <SchemaTree key={schemaResetKey} schema={active.schema} defaultExpanded={schemaDefaultExpanded} />

              {/* Example JSON */}
              {showExample && example != null && (
                <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-[#f6f8fa] border-b border-[#d1d9e0] px-3 py-1.5">
                    <span className="text-sm font-semibold text-[#656d76]">Example</span>
                    <button
                      onClick={() => { navigator.clipboard.writeText(JSON.stringify(example, null, 2)); }}
                      className="text-sm text-[#0969da] hover:underline"
                    >
                      Copy
                    </button>
                  </div>
                  <JsonCodeBlock
                    value={example}
                    className="max-h-80"
                    height="auto"
                  />
                </div>
              )}
            </>
          )}

          {!active.schema && !active.description && (
            <p className="text-sm text-[#656d76] italic">No response body</p>
          )}
        </div>
      )}
    </div>
  );
}
