import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { JsonEditor } from "../common/JsonEditor";
import { HeadersTable } from "../common/HeadersTable";
import { useProjectVariablesStore } from "../../store/projectVariables.store";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";

// Renders a warning string with two clickable hot-words:
//   • "Settings > Connections" / "Settings → Connections" → routes to /settings/connections
//   • "Connect now" → triggers onConnect (opens the ConnectEndpointModal)
function ConnectionWarning({ text, onConnect }: { text: string; onConnect?: () => void }) {
  const linkPattern = /(Settings\s*[→>]\s*Connections|Connect now)/;
  const parts = text.split(linkPattern);
  return (
    <p className="text-xs text-[#9a6700]">
      {parts.map((part, i) => {
        if (/^Settings/.test(part) && /Connections$/.test(part)) {
          return (
            <Link
              key={i}
              to="/settings/connections"
              className="font-semibold underline hover:text-[#7a5200]"
            >
              {part}
            </Link>
          );
        }
        if (part === "Connect now" && onConnect) {
          return (
            <button
              key={i}
              type="button"
              onClick={onConnect}
              className="font-semibold underline hover:text-[#7a5200]"
            >
              {part}
            </button>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

interface Props {
  endpoint: ParsedEndpointDoc;
  /** Connection ID resolved from version config */
  connectionId?: string;
  /** Base URL resolved from version config */
  baseUrl?: string;
  /** Whether the connection is ready to send requests */
  canSend: boolean;
  /** Message to show when connection is not ready */
  connectionWarning?: string;
  /** Opens the Connect Endpoint modal — used by the "Connect now" link in warnings */
  onOpenConnect?: () => void;
}

interface TryItResponse {
  status: number;
  statusText: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestUrl: string;
  responseHeaders: Record<string, string>;
  body: unknown;
  durationMs: number;
}

const STATUS_COLORS: Record<string, string> = {
  "2": "text-[#1a7f37] bg-[#dafbe1]",
  "3": "text-[#0969da] bg-[#ddf4ff]",
  "4": "text-[#9a6700] bg-[#fff8c5]",
  "5": "text-[#d1242f] bg-[#ffebe9]",
};

/** Inline copy button with checkmark feedback. */
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
      title={copied ? "Copied!" : label ?? "Copy to clipboard"}
      className={`shrink-0 p-1 rounded-md transition-colors ${copied ? "text-[#1a7f37] bg-[#dafbe1]" : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6]"}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
        </svg>
      )}
    </button>
  );
}

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

/** Collapsible accordion section — same design as Scenario Manager Run tab. */
function Accordion({ title, badge, defaultOpen = false, actions, children }: {
  title: string;
  badge?: React.ReactNode;
  defaultOpen?: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] hover:bg-[#eef1f6] transition-colors text-left"
      >
        <svg
          className={`w-3.5 h-3.5 text-[#656d76] shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
        </svg>
        <span className="text-xs font-semibold text-[#656d76] uppercase tracking-wider flex-1">
          {title}
        </span>
        {badge}
        {actions && <span onClick={(e) => e.stopPropagation()}>{actions}</span>}
      </button>
      {open && <div className="border-t border-[#d1d9e0]">{children}</div>}
    </div>
  );
}

/** Build a list of named examples from the endpoint spec. */
interface NamedExample {
  name: string;
  params: Record<string, string>;
  body: string;
}

function collectExamples(endpoint: ParsedEndpointDoc): NamedExample[] {
  const results: NamedExample[] = [];

  // Build param examples from schema.example
  const paramExamples: Record<string, string> = {};
  for (const p of endpoint.parameters) {
    const ex = p.example ?? p.schema?.example;
    if (ex != null) paramExamples[p.name] = String(ex);
  }

  // Request body examples (OAS3 `examples` map — named examples)
  const bodyExamples = endpoint.requestBody?.examples;
  if (bodyExamples && typeof bodyExamples === "object") {
    for (const [exName, exValue] of Object.entries(bodyExamples)) {
      results.push({
        name: exName,
        params: { ...paramExamples },
        body: typeof exValue === "string" ? exValue : JSON.stringify(exValue, null, 2),
      });
    }
  }

  // Single `example` from the media type
  if (results.length === 0 && endpoint.requestBody?.example != null) {
    const ex = endpoint.requestBody.example;
    results.push({
      name: "Example",
      params: { ...paramExamples },
      body: typeof ex === "string" ? ex : JSON.stringify(ex, null, 2),
    });
  }

  // If we only have param examples but no body example, still offer one entry
  if (results.length === 0 && Object.keys(paramExamples).length > 0) {
    results.push({
      name: "Example",
      params: { ...paramExamples },
      body: "",
    });
  }

  return results;
}

export function TryItPanel({ endpoint, connectionId, baseUrl, canSend, connectionWarning, onOpenConnect }: Props) {
  const variables = useProjectVariablesStore((s) => s.variables);

  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<TryItResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"request" | "response">("response");

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

  // Collect available examples from the spec
  const examples = useMemo(() => collectExamples(endpoint), [endpoint]);

  // Initialize param values — blank by default
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const p of [...pathParams, ...queryParams, ...headerParams]) {
      vals[p.name] = "";
    }
    return vals;
  });

  // Request body — blank by default
  const [body, setBody] = useState("");

  // Reset params + body when endpoint changes
  useEffect(() => {
    const vals: Record<string, string> = {};
    for (const p of [...endpoint.parameters]) {
      vals[p.name] = "";
    }
    setParamValues(vals);
    setBody("");
    setResponse(null);
    setError(null);
  }, [endpoint]);

  const updateParam = useCallback((name: string, value: string) => {
    setParamValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  function applyExample(ex: NamedExample) {
    setParamValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(ex.params)) {
        if (k in next) next[k] = v;
      }
      return next;
    });
    if (ex.body) setBody(ex.body);
  }

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
      const fullUrl = `${baseUrl || ""}${path}${qs}`;

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
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });

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
        requestHeaders: { ...headers },
        requestBody: body.trim() || null,
        requestUrl: fullUrl,
        responseHeaders,
        body: respBody,
        durationMs,
      });
      setResultTab("response");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResponse(null);
    } finally {
      setSending(false);
    }
  }

  const statusColorClass = response ? (STATUS_COLORS[String(response.status)[0]] ?? "text-[#656d76] bg-[#f6f8fa]") : "";

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {/* ── Connection warning banner ─────────────────────────────── */}
        {connectionWarning && (
          <div className="flex items-start gap-2 px-3 py-2 bg-[#fff8c5] border border-[#d4a72c]/30 rounded-md">
            <svg className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <ConnectionWarning text={connectionWarning} onConnect={onOpenConnect} />
          </div>
        )}

        {/* ── Examples dropdown ─────────────────────────────────────── */}
        {examples.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-[#656d76] uppercase tracking-wide shrink-0">Examples</label>
            <select
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (!isNaN(idx) && examples[idx]) applyExample(examples[idx]);
                e.target.value = "";
              }}
              defaultValue=""
              className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2 py-1.5 outline-none focus:border-[#0969da] cursor-pointer"
            >
              <option value="" disabled>Select an example to auto-fill…</option>
              {examples.map((ex, i) => (
                <option key={i} value={i}>{ex.name}</option>
              ))}
            </select>
          </div>
        )}

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
                    placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
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
            <JsonEditor
              value={body}
              onChange={setBody}
              height="12rem"
              placeholder="{}"
            />
          </div>
        )}

        {/* ── Send button (fixed width) ────────────────────────────── */}
        <button
          onClick={() => void handleSend()}
          disabled={sending || !canSend}
          title={!canSend ? "Configure a connection first" : undefined}
          className="w-[180px] flex items-center justify-center gap-2 bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#eef1f6] disabled:text-[#656d76] text-white text-sm font-medium rounded-md px-4 py-2 transition-colors"
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

        {/* ── Request / Response section ───────────────────────────── */}
        {response && (
          <div className="space-y-3">
            {/* Status row — matches Scenario Manager Run tab */}
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-md bg-[#f6f8fa] border border-[#d1d9e0]">
              <span className={`text-sm font-semibold px-2 py-0.5 rounded-full ${statusColorClass}`}>
                {response.status} {response.statusText}
              </span>
              <span className="ml-auto text-xs text-[#afb8c1]">{response.durationMs}ms</span>
            </div>

            {/* Tab bar */}
            <div className="flex items-center gap-1 border-b border-[#d1d9e0]">
              {(["request", "response"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setResultTab(tab)}
                  className={`px-3 py-1.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                    resultTab === tab
                      ? "border-[#fd8c73] text-[#1f2328]"
                      : "border-transparent text-[#656d76] hover:text-[#1f2328]"
                  }`}
                >
                  <span className="capitalize">{tab}</span>
                </button>
              ))}
            </div>

            {/* Request tab */}
            {resultTab === "request" && (
              <div className="space-y-3">
                {/* Request URL */}
                <div>
                  <p className="text-xs font-semibold text-[#656d76] uppercase tracking-wider mb-1.5">Request URL</p>
                  <div className="font-mono text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2 break-all">
                    {response.requestUrl}
                  </div>
                </div>
                {/* Request Headers */}
                {Object.keys(response.requestHeaders).length > 0 && (
                  <Accordion
                    title="Request Headers"
                    badge={<span className="text-xs text-[#656d76] tabular-nums">{Object.keys(response.requestHeaders).length}</span>}
                  >
                    <HeadersTable headers={response.requestHeaders} maskKeys={["Authorization", "X-FF-Connection-Id"]} />
                  </Accordion>
                )}
                {/* Request Body */}
                {response.requestBody && (
                  <Accordion
                    title="Request Body"
                    defaultOpen={true}
                    actions={<CopyButton value={response.requestBody} label="Copy request body" />}
                  >
                    <div className="p-0">
                      <JsonCodeBlock value={(() => { try { return JSON.parse(response.requestBody); } catch { return response.requestBody; } })()} height="28rem" />
                    </div>
                  </Accordion>
                )}
              </div>
            )}

            {/* Response tab */}
            {resultTab === "response" && (
              <div className="space-y-3">
                {/* Response Headers */}
                {Object.keys(response.responseHeaders).length > 0 && (
                  <Accordion
                    title="Response Headers"
                    badge={<span className="text-xs text-[#656d76] tabular-nums">{Object.keys(response.responseHeaders).length}</span>}
                  >
                    <HeadersTable headers={response.responseHeaders} />
                  </Accordion>
                )}
                {/* Response Body */}
                <Accordion
                  title="Response Body"
                  defaultOpen={true}
                  actions={response.body != null ? <CopyButton value={typeof response.body === "object" ? JSON.stringify(response.body, null, 2) : String(response.body)} label="Copy response body" /> : undefined}
                >
                  <div className="p-0">
                    {response.body != null ? (
                      <JsonCodeBlock
                        value={typeof response.body === "object" ? response.body : (() => { try { return JSON.parse(String(response.body)); } catch { return String(response.body); } })()}
                        height="28rem"
                      />
                    ) : (
                      <p className="text-xs text-[#afb8c1] italic px-3 py-2">No content</p>
                    )}
                  </div>
                </Accordion>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
