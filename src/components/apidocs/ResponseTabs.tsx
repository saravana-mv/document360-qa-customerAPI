import { useMemo, useState } from "react";
import { SchemaTree } from "./SchemaTree";
import { InlineMarkdown } from "./InlineMarkdown";
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
  const [allExpanded, setAllExpanded] = useState(false);
  const [selectedExampleName, setSelectedExampleName] = useState<string | null>(null);
  const active = responses.find(r => r.status === activeStatus) ?? responses[0];

  const exampleNames = useMemo(() => {
    return active?.examples ? Object.keys(active.examples) : [];
  }, [active]);

  // When the user switches status tabs, default the example selection to the
  // first example of the new status — not the previous tab's selection.
  const effectiveExampleName = selectedExampleName && exampleNames.includes(selectedExampleName)
    ? selectedExampleName
    : exampleNames[0] ?? null;

  const example = useMemo(() => {
    if (!active) return null;
    if (active.examples && effectiveExampleName) {
      return active.examples[effectiveExampleName];
    }
    if (active.example !== undefined) return active.example;
    if (!active.schema) return null;
    return generateSchemaExample(active.schema);
  }, [active, effectiveExampleName]);

  const toggleAll = () => {
    setAllExpanded(prev => !prev);
    setSchemaResetKey(k => k + 1);
  };

  if (responses.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#1f2328] pb-2 border-b border-[#d1d9e0]">Responses</h4>

      {/* Status tabs with colored dots */}
      <div className="flex items-center gap-0 border-b border-[#d1d9e0]">
        {responses.map(r => (
          <button
            key={r.status}
            onClick={() => { setActiveStatus(r.status); setShowExample(false); setSelectedExampleName(null); }}
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
        <>
          {/* Description (LHS) + toolbar (RHS) on same row */}
          {(active.description || active.schema) && (
            <div className="flex items-start justify-between gap-4">
              {active.description ? (
                <p className="text-sm text-[#656d76] leading-relaxed flex-1 min-w-0">
                  <InlineMarkdown text={active.description} />
                </p>
              ) : (
                <div className="flex-1" />
              )}
              {active.schema && (
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    onClick={() => setShowExample(v => !v)}
                    className="text-sm font-medium text-[#0969da] hover:underline"
                  >
                    {showExample ? "Hide Example" : "Show Example"}
                  </button>
                  <span className="text-sm text-[#d1d9e0]">|</span>
                  <button
                    onClick={toggleAll}
                    className="text-sm font-medium text-[#0969da] hover:underline"
                  >
                    {allExpanded ? "Collapse All" : "Expand All"}
                  </button>
                </div>
              )}
            </div>
          )}

          {active.schema && (
            <div className="border border-[#d1d9e0] rounded-lg p-4 space-y-3">
              {/* Schema tree */}
              <SchemaTree key={schemaResetKey} schema={active.schema} defaultExpanded={allExpanded} />

              {/* Example JSON */}
              {showExample && example != null && (
                <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                  <div className="flex items-center justify-between bg-[#f6f8fa] border-b border-[#d1d9e0] px-3 py-1.5 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-[#656d76] shrink-0">Example</span>
                      {exampleNames.length > 1 ? (
                        <select
                          value={effectiveExampleName ?? ""}
                          onChange={(e) => setSelectedExampleName(e.target.value)}
                          className="text-sm text-[#1f2328] bg-white border border-[#d1d9e0] rounded-md px-2 py-1 outline-none focus:border-[#0969da] cursor-pointer max-w-[280px] truncate"
                        >
                          {exampleNames.map((n) => (
                            <option key={n} value={n}>{n}</option>
                          ))}
                        </select>
                      ) : effectiveExampleName ? (
                        <span className="text-sm text-[#656d76] font-mono truncate">{effectiveExampleName}</span>
                      ) : null}
                    </div>
                    <button
                      onClick={() => { navigator.clipboard.writeText(JSON.stringify(example, null, 2)); }}
                      className="text-sm text-[#0969da] hover:underline shrink-0"
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
            </div>
          )}

          {!active.schema && !active.description && (
            <p className="text-sm text-[#656d76] italic">No response body</p>
          )}
        </>
      )}
    </div>
  );
}
