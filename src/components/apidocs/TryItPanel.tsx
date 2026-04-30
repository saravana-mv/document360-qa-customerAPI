import { useCallback, useEffect, useMemo, useState } from "react";
import { MethodBadge } from "./MethodBadge";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { useConnectionsStore } from "../../store/connections.store";
import { useProjectVariablesStore } from "../../store/projectVariables.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { ProviderBadge } from "../connections/ConnectionFormModal";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";
import type { Schema } from "../../types/spec.types";

interface Props {
  endpoint: ParsedEndpointDoc;
  versionFolder: string;
}

interface TryItResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: unknown;
  durationMs: number;
}

/** Build a sample JSON object from a schema (best effort). */
function buildExampleFromSchema(schema: Schema | undefined): unknown {
  if (!schema) return undefined;
  if (schema.example != null) return schema.example;
  if (schema.default != null) return schema.default;

  if (schema.type === "object" || schema.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, prop] of Object.entries(schema.properties ?? {})) {
      obj[key] = buildExampleFromSchema(prop);
    }
    return obj;
  }
  if (schema.type === "array" && schema.items) {
    return [buildExampleFromSchema(schema.items)];
  }
  if (schema.enum && schema.enum.length > 0) return schema.enum[0];

  switch (schema.type) {
    case "string":
      if (schema.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      if (schema.format === "date-time") return new Date().toISOString();
      if (schema.format === "date") return new Date().toISOString().slice(0, 10);
      return "";
    case "integer": case "number": return 0;
    case "boolean": return false;
    default: return null;
  }
}

const STATUS_COLORS: Record<string, string> = {
  "2": "text-[#1a7f37] bg-[#dafbe1]",
  "3": "text-[#0969da] bg-[#ddf4ff]",
  "4": "text-[#9a6700] bg-[#fff8c5]",
  "5": "text-[#d1242f] bg-[#ffebe9]",
};

/** Small icon button to fill a param from a matching project variable. */
function UseVarButton({ paramName, varMap, onApply }: {
  paramName: string;
  varMap: Map<string, string>;
  onApply: (value: string) => void;
}) {
  const varValue = varMap.get(paramName);
  if (!varValue) return null;
  return (
    <button
      onClick={() => onApply(varValue)}
      className="text-[#0969da] hover:text-[#0860ca] shrink-0 p-0.5 rounded hover:bg-[#ddf4ff] transition-colors"
      title={`Use project variable: ${paramName} = ${varValue}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.889" />
      </svg>
    </button>
  );
}

export function TryItPanel({ endpoint, versionFolder }: Props) {
  const { connections, authStatus: connAuthStatus, load: loadConnections } = useConnectionsStore();
  const variables = useProjectVariablesStore((s) => s.variables);
  const versionConfigs = useScenarioOrgStore((s) => s.versionConfigs);

  useEffect(() => { void loadConnections(); }, [loadConnections]);

  // Resolve version config for this version folder
  const versionConfig = versionConfigs[versionFolder];
  const defaultConnectionId = versionConfig?.connectionId ?? "";
  const defaultBaseUrl = versionConfig?.baseUrl ?? "";

  const [connectionId, setConnectionId] = useState(defaultConnectionId);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<TryItResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Sync defaults when version config changes
  useEffect(() => {
    setConnectionId(versionConfig?.connectionId ?? "");
    setBaseUrl(versionConfig?.baseUrl ?? "");
  }, [versionConfig?.connectionId, versionConfig?.baseUrl]);

  // Build param input state from endpoint parameters
  const pathParams = endpoint.parameters.filter((p) => p.in === "path");
  const queryParams = endpoint.parameters.filter((p) => p.in === "query");
  const headerParams = endpoint.parameters.filter((p) => p.in === "header");

  // Variable lookup for auto-fill
  const varMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variables) m.set(v.name, v.value);
    return m;
  }, [variables]);

  // Initialize param values — auto-fill from project variables
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const p of [...pathParams, ...queryParams, ...headerParams]) {
      const projVar = varMap.get(p.name);
      if (projVar) {
        vals[p.name] = projVar;
      } else if (p.example != null) {
        vals[p.name] = String(p.example);
      } else if (p.schema?.example != null) {
        vals[p.name] = String(p.schema.example);
      } else {
        vals[p.name] = "";
      }
    }
    return vals;
  });

  // Request body — pre-filled from schema example
  const [body, setBody] = useState<string>(() => {
    if (!endpoint.requestBody?.schema) return "";
    const example = endpoint.requestBody.example ?? buildExampleFromSchema(endpoint.requestBody.schema);
    return example ? JSON.stringify(example, null, 2) : "";
  });

  const updateParam = useCallback((name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  // Build the full URL
  const resolvedUrl = useMemo(() => {
    let path = endpoint.path;
    for (const p of pathParams) {
      const val = paramValues[p.name] || `{${p.name}}`;
      path = path.replace(`{${p.name}}`, encodeURIComponent(val));
    }
    const queryParts: string[] = [];
    for (const p of queryParams) {
      const val = paramValues[p.name];
      if (val) queryParts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(val)}`);
    }
    const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return `${path}${qs}`;
  }, [endpoint.path, pathParams, queryParams, paramValues]);

  async function handleSend() {
    setSending(true);
    setError(null);
    setResponse(null);

    const start = Date.now();
    try {
      let path = endpoint.path;
      for (const p of pathParams) {
        const val = paramValues[p.name] || "";
        path = path.replace(`{${p.name}}`, encodeURIComponent(val));
      }
      const queryParts: string[] = [];
      for (const p of queryParams) {
        const val = paramValues[p.name];
        if (val) queryParts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(val)}`);
      }
      const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
      const fetchUrl = `/api/proxy${path}${qs}`;

      const headers: Record<string, string> = {};
      if (body.trim()) headers["Content-Type"] = "application/json";
      if (connectionId) headers["X-FF-Connection-Id"] = connectionId;
      if (baseUrl) headers["X-FF-Base-Url"] = baseUrl;

      for (const p of headerParams) {
        const val = paramValues[p.name];
        if (val) headers[p.name] = val;
      }

      const res = await fetch(fetchUrl, {
        method: endpoint.method.toUpperCase(),
        headers,
        body: body.trim() ? body : undefined,
      });

      const durationMs = Date.now() - start;
      const respHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { respHeaders[k] = v; });

      let respBody: unknown = null;
      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        try { respBody = await res.json(); } catch { respBody = null; }
      } else {
        const text = await res.text();
        respBody = text || null;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: respHeaders,
        body: respBody,
        durationMs,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResponse(null);
    } finally {
      setSending(false);
    }
  }

  const selectedConn = connections.find((c) => c.id === connectionId);
  const statusColorClass = response ? (STATUS_COLORS[String(response.status)[0]] ?? "text-[#656d76] bg-[#f6f8fa]") : "";

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Endpoint summary */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <MethodBadge method={endpoint.method} size="xs" />
        <code className="text-xs font-mono text-[#656d76] truncate flex-1">{resolvedUrl}</code>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* ── Connection (same pattern as ConnectEndpointModal) ───────── */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Connection</label>
          <select
            value={connectionId}
            onChange={(e) => setConnectionId(e.target.value)}
            className="w-full text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
          >
            <option value="">No auth</option>
            {connections.map((c) => {
              const isOAuth = c.provider === "oauth2";
              const oauthOk = isOAuth && connAuthStatus[c.id]?.authenticated;
              const tokenOk = !isOAuth && c.hasCredential;
              const suffix = oauthOk ? " \u2713" : tokenOk ? " \u2713" : "";
              return (
                <option key={c.id} value={c.id}>{c.name}{suffix}</option>
              );
            })}
          </select>
          {/* Status indicator — mirrors ConnectEndpointModal */}
          {selectedConn && selectedConn.provider === "oauth2" && connAuthStatus[selectedConn.id]?.authenticated && (
            <p className="text-xs text-[#1a7f37] flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-[#1a7f37] shrink-0" />
              OAuth connected
            </p>
          )}
          {selectedConn && selectedConn.provider === "oauth2" && !connAuthStatus[selectedConn.id]?.authenticated && (
            <p className="text-xs text-[#656d76]">
              Not connected — go to Settings &rarr; Connections to authenticate.
            </p>
          )}
          {selectedConn && selectedConn.provider !== "oauth2" && selectedConn.hasCredential && (
            <p className="text-xs text-[#1a7f37] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#1a7f37] shrink-0" />
              <ProviderBadge provider={selectedConn.provider} />
              <span>Credential configured</span>
            </p>
          )}
          {selectedConn && selectedConn.provider !== "oauth2" && !selectedConn.hasCredential && (
            <p className="text-xs text-[#656d76]">
              No credential stored — go to Settings &rarr; Connections to add one.
            </p>
          )}
          {connections.length === 0 && (
            <p className="text-xs text-[#656d76]">
              No connections registered. Go to Settings &rarr; Connections to create one.
            </p>
          )}
        </div>

        {/* ── Base URL ──────────────────────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Base URL</label>
          <input
            type="text"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://api.example.com"
            className="w-full text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono placeholder-[#afb8c1]"
          />
        </div>

        {/* ── Path Parameters ──────────────────────────────────────── */}
        {pathParams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Path parameters</label>
            {pathParams.map((p) => (
              <div key={p.name} className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-mono text-[#1f2328]">
                    {p.name}
                    {p.required && <span className="text-[#d1242f] ml-0.5">*</span>}
                  </span>
                  {p.schema?.type && (
                    <span className="text-xs text-[#656d76]">{p.schema.type}{p.schema.format ? ` (${p.schema.format})` : ""}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={paramValues[p.name] ?? ""}
                    onChange={(e) => updateParam(p.name, e.target.value)}
                    placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
                    className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2 py-1 bg-white text-[#1f2328] placeholder-[#afb8c1] outline-none focus:border-[#0969da] font-mono"
                  />
                  <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Query Parameters ─────────────────────────────────────── */}
        {queryParams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Query parameters</label>
            {queryParams.map((p) => (
              <div key={p.name} className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <span className="text-sm font-mono text-[#1f2328]">
                    {p.name}
                    {p.required && <span className="text-[#d1242f] ml-0.5">*</span>}
                  </span>
                  {p.schema?.type && (
                    <span className="text-xs text-[#656d76]">{p.schema.type}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={paramValues[p.name] ?? ""}
                    onChange={(e) => updateParam(p.name, e.target.value)}
                    placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
                    className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2 py-1 bg-white text-[#1f2328] placeholder-[#afb8c1] outline-none focus:border-[#0969da] font-mono"
                  />
                  <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Header Parameters ────────────────────────────────────── */}
        {headerParams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Headers</label>
            {headerParams.map((p) => (
              <div key={p.name} className="space-y-0.5">
                <span className="text-sm font-mono text-[#1f2328]">{p.name}</span>
                <div className="flex items-center gap-1">
                  <input
                    type="text"
                    value={paramValues[p.name] ?? ""}
                    onChange={(e) => updateParam(p.name, e.target.value)}
                    placeholder={p.schema?.type ?? ""}
                    className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2 py-1 bg-white text-[#1f2328] placeholder-[#afb8c1] outline-none focus:border-[#0969da] font-mono"
                  />
                  <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Request Body ─────────────────────────────────────────── */}
        {endpoint.requestBody && (
          <div className="space-y-1.5">
            <div className="flex items-baseline gap-2">
              <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Request body</label>
              <span className="text-xs text-[#656d76]">{endpoint.requestBody.contentType}</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(12, Math.max(4, body.split("\n").length + 1))}
              className="w-full text-sm border border-[#d1d9e0] rounded-md px-3 py-2 bg-white text-[#1f2328] outline-none focus:border-[#0969da] font-mono resize-y"
              spellCheck={false}
            />
          </div>
        )}

        {/* ── Send button (fixed width) ────────────────────────────── */}
        <button
          onClick={() => void handleSend()}
          disabled={sending}
          className="w-[180px] flex items-center justify-center gap-2 bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] text-white text-sm font-medium rounded-md px-4 py-2 transition-colors"
        >
          {sending ? (
            <>
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Sending...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
              Send Request
            </>
          )}
        </button>

        {/* ── Error ────────────────────────────────────────────────── */}
        {error && (
          <div className="text-sm text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md px-3 py-2">
            {error}
          </div>
        )}

        {/* ── Response ─────────────────────────────────────────────── */}
        {response && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[#656d76] uppercase tracking-wide">Response</span>
              <span className={`text-sm font-bold font-mono px-2 py-0.5 rounded ${statusColorClass}`}>
                {response.status}
              </span>
              <span className="text-xs text-[#656d76]">{response.statusText}</span>
              <span className="text-xs text-[#656d76] ml-auto">{response.durationMs}ms</span>
            </div>
            {response.body != null && (
              <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
                {typeof response.body === "object" ? (
                  <JsonCodeBlock value={response.body} height="300px" />
                ) : (
                  <pre className="text-sm font-mono text-[#1f2328] p-3 overflow-auto max-h-[300px] bg-white">
                    {String(response.body)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
