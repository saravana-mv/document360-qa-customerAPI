import { MethodBadge } from "./MethodBadge";
import { ParameterTable } from "./ParameterTable";
import { ResponseTabs } from "./ResponseTabs";
import { SchemaTree } from "./SchemaTree";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";
import type { SecurityScheme } from "../../types/spec.types";

interface Props {
  endpoint: ParsedEndpointDoc;
  securitySchemes?: Record<string, SecurityScheme>;
}

export function EndpointDocView({ endpoint, securitySchemes }: Props) {
  const pathParams = endpoint.parameters.filter(p => p.in === "path");
  const queryParams = endpoint.parameters.filter(p => p.in === "query");
  const headerParams = endpoint.parameters.filter(p => p.in === "header");

  // Resolve security scheme names
  const securityNames: string[] = [];
  if (endpoint.security && securitySchemes) {
    for (const req of endpoint.security) {
      for (const name of Object.keys(req)) {
        const scheme = securitySchemes[name];
        if (scheme) {
          const label = scheme.type === "oauth2" ? "OAuth 2.0"
            : scheme.type === "http" && scheme.scheme === "bearer" ? "Bearer Token"
            : scheme.type === "apiKey" ? `API Key (${scheme.in}: ${scheme.name})`
            : scheme.type;
          securityNames.push(label);
        }
      }
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {/* Header: method badge + path */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <MethodBadge method={endpoint.method} />
          <code className="text-sm font-mono font-medium text-[#1f2328] break-all">
            {endpoint.path}
          </code>
          {endpoint.deprecated && (
            <span className="text-xs bg-[#ffebe9] text-[#d1242f] border border-[#ffcecb] rounded px-1.5 py-0.5 font-medium">
              Deprecated
            </span>
          )}
        </div>
        {endpoint.summary && (
          <h2 className="text-sm font-semibold text-[#1f2328]">{endpoint.summary}</h2>
        )}
        {endpoint.description && (
          <p className="text-sm text-[#656d76] whitespace-pre-line">{endpoint.description}</p>
        )}
        {endpoint.operationId && (
          <p className="text-xs text-[#656d76]">
            Operation ID: <code className="bg-[#f6f8fa] px-1 rounded text-[#1f2328]">{endpoint.operationId}</code>
          </p>
        )}
      </div>

      {/* Security */}
      {securityNames.length > 0 && (
        <div className="space-y-1">
          <h4 className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Security</h4>
          <div className="flex items-center gap-2 flex-wrap">
            {securityNames.map((name, i) => (
              <span key={i} className="text-xs bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2 py-1 text-[#1f2328]">
                <svg className="w-3 h-3 text-[#656d76] inline mr-1" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                </svg>
                {name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Parameters */}
      <ParameterTable title="Path parameters" parameters={pathParams} />
      <ParameterTable title="Query parameters" parameters={queryParams} />
      <ParameterTable title="Header parameters" parameters={headerParams} />

      {/* Request Body */}
      {endpoint.requestBody && (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <h4 className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Request body</h4>
            <span className="text-xs text-[#656d76]">{endpoint.requestBody.contentType}</span>
            {endpoint.requestBody.required && (
              <span className="text-xs text-[#d1242f] font-medium">required</span>
            )}
          </div>
          {endpoint.requestBody.description && (
            <p className="text-xs text-[#656d76]">{endpoint.requestBody.description}</p>
          )}
          {endpoint.requestBody.schema && (
            <div className="border border-[#d1d9e0] rounded-md p-3">
              <SchemaTree schema={endpoint.requestBody.schema} />
            </div>
          )}
        </div>
      )}

      {/* Responses */}
      <ResponseTabs responses={endpoint.responses} />
    </div>
  );
}
