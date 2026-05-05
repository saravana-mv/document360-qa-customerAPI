import { useMemo, useState } from "react";
import { MethodBadge } from "./MethodBadge";
import { ParameterTable } from "./ParameterTable";
import { ResponseTabs } from "./ResponseTabs";
import { SchemaTree } from "./SchemaTree";
import { InlineMarkdown, InlineCode } from "./InlineMarkdown";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { generateSchemaExample } from "../../lib/spec/schemaExample";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";
import type { SecurityScheme } from "../../types/spec.types";

interface Props {
  endpoint: ParsedEndpointDoc;
  /** Resolved security schemes from the spec — used by the Security section. */
  securitySchemes?: Record<string, SecurityScheme>;
}

interface ResolvedSecurityScheme {
  name: string;
  scheme: SecurityScheme;
}

/** Resolve the security schemes referenced by the endpoint into concrete details. */
export function resolveEndpointSecurity(
  endpoint: ParsedEndpointDoc,
  securitySchemes?: Record<string, SecurityScheme>,
): ResolvedSecurityScheme[] {
  if (!endpoint.security || !securitySchemes) return [];
  const out: ResolvedSecurityScheme[] = [];
  const seen = new Set<string>();
  for (const req of endpoint.security) {
    for (const name of Object.keys(req)) {
      if (seen.has(name)) continue;
      const scheme = securitySchemes[name];
      if (scheme) {
        out.push({ name, scheme });
        seen.add(name);
      }
    }
  }
  return out;
}

/** Display label for the security scheme type (e.g. "API Key", "Bearer Token"). */
export function formatSchemeType(scheme: SecurityScheme): string {
  if (scheme.type === "oauth2") return "OAuth 2.0";
  if (scheme.type === "http" && scheme.scheme === "bearer") return "Bearer Token";
  if (scheme.type === "http" && scheme.scheme === "basic") return "Basic Auth";
  if (scheme.type === "apiKey") return "API Key";
  return scheme.type;
}

/** Where the credential lives — "Header name", "Query parameter name", "Cookie name". */
export function formatSchemeLocation(scheme: SecurityScheme): string | null {
  if (!scheme.in) return null;
  switch (scheme.in.toLowerCase()) {
    case "header": return "Header name";
    case "query": return "Query parameter name";
    case "cookie": return "Cookie name";
    default: return scheme.in;
  }
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

  const methodBox = METHOD_BOX_STYLES[endpoint.method.toLowerCase()] ?? "border-[#d1d9e0] bg-[#f6f8fa]";

  const securityDetails = useMemo(
    () => resolveEndpointSecurity(endpoint, securitySchemes),
    [endpoint, securitySchemes],
  );

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
          <p className="text-sm text-[#656d76] leading-relaxed">
            <InlineMarkdown text={endpoint.description} />
          </p>
        )}
      </div>

      {/* ── Security ──────────────────────────────────────────────── */}
      {securityDetails.length > 0 && (
        <SecuritySection details={securityDetails} />
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

// ── Security Section ───────────────────────────────────────────────────────

function SecuritySection({ details }: { details: ResolvedSecurityScheme[] }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-[#1f2328] pb-2 border-b border-[#d1d9e0]">Security</h4>
      <div className="space-y-3">
        {details.map(({ name, scheme }, i) => {
          const typeLabel = formatSchemeType(scheme);
          const locLabel = formatSchemeLocation(scheme);
          return (
            <div key={i} className="border border-[#d1d9e0] rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                <span className="text-sm font-semibold text-[#1f2328]">
                  {typeLabel}: <span className="font-mono">{name}</span>
                </span>
              </div>

              {/* Location row — "Query parameter name: code" */}
              {locLabel && scheme.name && (
                <div className="text-sm text-[#656d76] flex items-center gap-1.5 flex-wrap">
                  <span>{locLabel}</span>
                  <InlineCode>{scheme.name}</InlineCode>
                </div>
              )}

              {/* Bearer format / OAuth scheme detail */}
              {scheme.bearerFormat && (
                <div className="text-sm text-[#656d76] flex items-center gap-1.5 flex-wrap">
                  <span>Format</span>
                  <InlineCode>{scheme.bearerFormat}</InlineCode>
                </div>
              )}

              {/* Description */}
              {scheme.description && (
                <p className="text-sm text-[#656d76] leading-relaxed">
                  <InlineMarkdown text={scheme.description} />
                </p>
              )}
            </div>
          );
        })}
      </div>
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

      {/* Description (LHS) + toolbar (RHS) on same row */}
      {(requestBody.description || requestBody.schema) && (
        <div className="flex items-start justify-between gap-4">
          {requestBody.description ? (
            <p className="text-sm text-[#656d76] leading-relaxed flex-1 min-w-0">
              <InlineMarkdown text={requestBody.description} />
            </p>
          ) : (
            <div className="flex-1" />
          )}
          {requestBody.schema && (
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

      {requestBody.schema && (
        <div className="border border-[#d1d9e0] rounded-lg p-4 space-y-3">
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
        </div>
      )}
    </div>
  );
}

