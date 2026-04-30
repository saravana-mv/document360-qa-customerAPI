import { useMemo, useState } from "react";
import { MethodBadge } from "./MethodBadge";
import { ParameterTable } from "./ParameterTable";
import { ResponseTabs } from "./ResponseTabs";
import { SchemaTree } from "./SchemaTree";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { generateSchemaExample } from "../../lib/spec/schemaExample";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";
import type { SecurityScheme } from "../../types/spec.types";

interface Props {
  endpoint: ParsedEndpointDoc;
  /** Kept for backward compatibility; security details are no longer rendered per-endpoint. */
  securitySchemes?: Record<string, SecurityScheme>;
}

// ── Method badge border color for the path box ──────────────────────────────
const METHOD_BOX_STYLES: Record<string, string> = {
  get: "border-[#b6e3ff] bg-[#f0f9ff]",
  post: "border-[#aceebb] bg-[#f6fff8]",
  put: "border-[#f5e0a0] bg-[#fffdf5]",
  patch: "border-[#f5e0a0] bg-[#fffdf5]",
  delete: "border-[#ffcecb] bg-[#fff5f5]",
};

export function EndpointDocView({ endpoint }: Props) {
  const pathParams = endpoint.parameters.filter(p => p.in === "path");
  const queryParams = endpoint.parameters.filter(p => p.in === "query");
  const headerParams = endpoint.parameters.filter(p => p.in === "header");

  const methodBox = METHOD_BOX_STYLES[endpoint.method.toLowerCase()] ?? "border-[#d1d9e0] bg-[#f6f8fa]";

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          {endpoint.summary && (
            <h1 className="text-lg font-semibold text-[#1f2328]">{endpoint.summary}</h1>
          )}
          {endpoint.deprecated && (
            <span className="text-xs bg-[#fff8c5] text-[#9a6700] border border-[#f5e0a0] rounded px-1.5 py-0.5 font-semibold">
              DEPRECATED
            </span>
          )}
        </div>

        {/* Method + Path box */}
        <div className={`flex items-center gap-2.5 border rounded-lg px-4 py-2.5 ${methodBox}`}>
          <MethodBadge method={endpoint.method} />
          <code className="text-sm font-mono font-medium text-[#1f2328] break-all">
            {endpoint.path}
          </code>
        </div>

        {endpoint.description && (
          <p className="text-sm text-[#656d76] leading-relaxed">{endpoint.description}</p>
        )}
      </div>

      {/* ── Parameters ────────────────────────────────────────────── */}
      <ParameterTable title="Path Parameters" parameters={pathParams} />
      <ParameterTable title="Query Parameters" parameters={queryParams} />
      <ParameterTable title="Header Parameters" parameters={headerParams} />

      {/* ── Request Body ──────────────────────────────────────────── */}
      {endpoint.requestBody && (
        <RequestBodySection requestBody={endpoint.requestBody} />
      )}

      {/* ── Responses ─────────────────────────────────────────────── */}
      <ResponseTabs responses={endpoint.responses} />
    </div>
  );
}

// ── Request Body Section ────────────────────────────────────────────────────

function RequestBodySection({ requestBody }: { requestBody: NonNullable<ParsedEndpointDoc["requestBody"]> }) {
  const [showExample, setShowExample] = useState(false);
  const [schemaResetKey, setSchemaResetKey] = useState(0);
  const [allExpanded, setAllExpanded] = useState(false);

  const example = useMemo(() => {
    if (requestBody.example !== undefined) return requestBody.example;
    if (!requestBody.schema) return null;
    return generateSchemaExample(requestBody.schema);
  }, [requestBody]);

  const toggleAll = () => {
    setAllExpanded(prev => !prev);
    setSchemaResetKey(k => k + 1);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 pb-2 border-b border-[#d1d9e0]">
        <h4 className="text-sm font-semibold text-[#1f2328]">Body Parameters</h4>
        {requestBody.required && (
          <span className="text-xs font-semibold text-[#d1242f]">REQUIRED</span>
        )}
      </div>

      {requestBody.description && (
        <p className="text-sm text-[#656d76] leading-relaxed">{requestBody.description}</p>
      )}

      <div className="border border-[#d1d9e0] rounded-lg p-4 space-y-3">
        {requestBody.schema && (
          <>
            {/* Right-aligned toolbar */}
            <div className="flex items-center justify-end gap-3">
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

            {/* Schema tree */}
            <SchemaTree key={schemaResetKey} schema={requestBody.schema} defaultExpanded={allExpanded} />

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
      </div>
    </div>
  );
}

