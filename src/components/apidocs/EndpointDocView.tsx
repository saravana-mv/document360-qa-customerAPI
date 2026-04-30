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

export function EndpointDocView({ endpoint, securitySchemes }: Props) {
  const pathParams = endpoint.parameters.filter(p => p.in === "path");
  const queryParams = endpoint.parameters.filter(p => p.in === "query");
  const headerParams = endpoint.parameters.filter(p => p.in === "header");

  // Resolve security schemes for display
  const securityDetails = useMemo(() => {
    if (!endpoint.security || !securitySchemes) return [];
    const result: { name: string; scheme: SecurityScheme }[] = [];
    for (const req of endpoint.security) {
      for (const name of Object.keys(req)) {
        const scheme = securitySchemes[name];
        if (scheme) result.push({ name, scheme });
      }
    }
    return result;
  }, [endpoint.security, securitySchemes]);

  const methodBox = METHOD_BOX_STYLES[endpoint.method.toLowerCase()] ?? "border-[#d1d9e0] bg-[#f6f8fa]";

  return (
    <div className="flex-1 overflow-y-auto p-8 space-y-8">
      {/* ── Header ────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {endpoint.summary && (
          <h1 className="text-lg font-semibold text-[#1f2328]">{endpoint.summary}</h1>
        )}

        {/* Method + Path box */}
        <div className={`flex items-center gap-2.5 border rounded-lg px-4 py-2.5 ${methodBox}`}>
          <MethodBadge method={endpoint.method} />
          <code className="text-sm font-mono font-medium text-[#1f2328] break-all">
            {endpoint.path}
          </code>
        </div>

        {endpoint.description && (
          <p className="text-sm text-[#656d76] whitespace-pre-line">{endpoint.description}</p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          {endpoint.operationId && (
            <p className="text-xs text-[#656d76]">
              Operation ID: <code className="bg-[#f6f8fa] px-1 rounded text-[#1f2328]">{endpoint.operationId}</code>
            </p>
          )}
          {endpoint.deprecated && (
            <span className="text-xs bg-[#fff8c5] text-[#9a6700] border border-[#f5e0a0] rounded px-1.5 py-0.5 font-semibold">
              DEPRECATED
            </span>
          )}
        </div>
      </div>

      {/* ── Security ──────────────────────────────────────────────── */}
      {securityDetails.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-semibold text-[#1f2328] pb-2 border-b border-[#d1d9e0]">Security</h4>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
            {securityDetails.map(({ name, scheme }, i) => (
              <div key={i} className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                  </svg>
                  <span className="text-sm font-semibold text-[#1f2328]">{name}</span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                  <dt className="text-[#656d76] font-medium">Type</dt>
                  <dd className="text-[#1f2328]">{formatSchemeType(scheme)}</dd>
                  {scheme.name && (
                    <>
                      <dt className="text-[#656d76] font-medium">Name</dt>
                      <dd className="text-[#1f2328] font-mono">{scheme.name}</dd>
                    </>
                  )}
                  {scheme.in && (
                    <>
                      <dt className="text-[#656d76] font-medium">In</dt>
                      <dd className="text-[#1f2328]">{scheme.in}</dd>
                    </>
                  )}
                  {scheme.scheme && (
                    <>
                      <dt className="text-[#656d76] font-medium">Scheme</dt>
                      <dd className="text-[#1f2328]">{scheme.scheme}</dd>
                    </>
                  )}
                  {scheme.bearerFormat && (
                    <>
                      <dt className="text-[#656d76] font-medium">Format</dt>
                      <dd className="text-[#1f2328]">{scheme.bearerFormat}</dd>
                    </>
                  )}
                </dl>
              </div>
            ))}
          </div>
        </div>
      )}

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
  const [schemaDefaultExpanded, setSchemaDefaultExpanded] = useState(true);

  const example = useMemo(() => {
    if (requestBody.example !== undefined) return requestBody.example;
    if (!requestBody.schema) return null;
    return generateSchemaExample(requestBody.schema);
  }, [requestBody]);

  return (
    <div className="space-y-3">
      <div className="flex items-baseline gap-3 pb-2 border-b border-[#d1d9e0]">
        <h4 className="text-sm font-semibold text-[#1f2328]">Body Parameters</h4>
        {requestBody.required && (
          <span className="text-xs font-semibold text-[#d1242f]">REQUIRED</span>
        )}
      </div>

      {requestBody.description && (
        <p className="text-sm text-[#656d76]">{requestBody.description}</p>
      )}

      <div className="border border-[#d1d9e0] rounded-lg p-4 space-y-3">
        {/* Content type */}
        <div className="flex items-center gap-2 text-xs text-[#656d76]">
          <span className="font-semibold">Content-Type:</span>
          <code className="bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5 text-[#1f2328]">
            {requestBody.contentType}
          </code>
        </div>

        {requestBody.schema && (
          <>
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setShowExample(v => !v)}
                className="text-xs font-medium text-[#0969da] hover:underline"
              >
                {showExample ? "Close Example" : "Show Example"}
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setSchemaDefaultExpanded(true); setSchemaResetKey(k => k + 1); }}
                  className="text-xs text-[#656d76] hover:text-[#1f2328]"
                >
                  Expand All
                </button>
                <span className="text-xs text-[#d1d9e0]">|</span>
                <button
                  onClick={() => { setSchemaDefaultExpanded(false); setSchemaResetKey(k => k + 1); }}
                  className="text-xs text-[#656d76] hover:text-[#1f2328]"
                >
                  Collapse All
                </button>
              </div>
            </div>

            {/* Schema tree */}
            <SchemaTree key={schemaResetKey} schema={requestBody.schema} defaultExpanded={schemaDefaultExpanded} />

            {/* Example JSON */}
            {showExample && example != null && (
              <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                <div className="flex items-center justify-between bg-[#f6f8fa] border-b border-[#d1d9e0] px-3 py-1.5">
                  <span className="text-xs font-semibold text-[#656d76]">Example</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(JSON.stringify(example, null, 2)); }}
                    className="text-xs text-[#0969da] hover:underline"
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

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatSchemeType(scheme: SecurityScheme): string {
  if (scheme.type === "oauth2") return "OAuth 2.0";
  if (scheme.type === "http" && scheme.scheme === "bearer") return "Bearer Token";
  if (scheme.type === "http" && scheme.scheme === "basic") return "Basic Auth";
  if (scheme.type === "apiKey") return "API Key";
  return scheme.type;
}
