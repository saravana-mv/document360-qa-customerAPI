import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { JsonCodeBlock } from "../common/JsonCodeBlock";
import { JsonEditor } from "../common/JsonEditor";
import { HeadersTable } from "../common/HeadersTable";
import { useProjectVariablesStore } from "../../store/projectVariables.store";
import type { ParsedEndpointDoc } from "../../lib/spec/swaggerParser";
import type { Schema, SecurityScheme } from "../../types/spec.types";
import {
  resolveEndpointSecurity,
  formatSchemeType,
  formatSchemeLocation,
} from "./EndpointDocView";
import { InlineCode, InlineMarkdown } from "./InlineMarkdown";
import { EnhanceDocsExampleModal } from "./EnhanceDocsExampleModal";

// Renders a warning string with two clickable hot-words:
//   • "Settings > Connections" / "Settings → Connections" → routes to /settings/connections
//   • "Configure" → triggers onConnect (opens the ConnectEndpointModal)
function ConnectionWarning({ text, onConnect }: { text: string; onConnect?: () => void }) {
  const linkPattern = /(Settings\s*[→>]\s*Connections|Configure)/;
  const parts = text.split(linkPattern);
  return (
    <p className="text-sm text-[#9a6700]">
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
        if (part === "Configure" && onConnect) {
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
  /** Opens the Connect Endpoint modal — used by the "Configure" link in warnings */
  onOpenConnect?: () => void;
  /** Resolved security schemes from the spec — used for the Authentication section */
  securitySchemes?: Record<string, SecurityScheme>;
  /** Project-scoped path to the spec MD file currently being viewed (e.g. "v3/articles/create-article.md") */
  specPath?: string;
  /** Top-level version folder for the active spec (e.g. "v3") */
  versionFolder?: string;
  /** Callback fired after an Enhance-Docs save succeeds — used to bust the parsed-spec cache */
  onSpecRefresh?: () => void;
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

// Shared input/select base styles — fixed 380×40 size for consistent layout
// across all input controls in the Try It panel.
const INPUT_BASE = "w-[380px] h-[40px] text-sm border border-[#d1d9e0] rounded-md px-3 bg-white text-[#1f2328] placeholder-[#afb8c1] outline-none focus:border-[#0969da]";
const INPUT_MONO = `${INPUT_BASE} font-mono`;
const SELECT_BASE = "w-[380px] h-[40px] text-sm border border-[#d1d9e0] rounded-md px-3 bg-white text-[#1f2328] outline-none focus:border-[#0969da] cursor-pointer font-mono";

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

/** snake_case → camelCase (e.g. "project_id" → "projectId"). */
function toCamelCase(s: string): string {
  return s.replace(/_([a-zA-Z0-9])/g, (_, c) => (c as string).toUpperCase());
}

/** camelCase → snake_case (e.g. "projectId" → "project_id"). */
function toSnakeCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

/**
 * Find a project variable for a parameter name, tolerating snake_case ↔
 * camelCase mismatches (OpenAPI specs commonly use `project_id` while
 * FlowForge's auto-detect suggests `projectId` as the variable name).
 */
function findVarMatch<T>(paramName: string, map: Map<string, T>): { key: string; value: T } | null {
  const direct = map.get(paramName);
  if (direct !== undefined) return { key: paramName, value: direct };
  const camel = toCamelCase(paramName);
  if (camel !== paramName) {
    const v = map.get(camel);
    if (v !== undefined) return { key: camel, value: v };
  }
  const snake = toSnakeCase(paramName);
  if (snake !== paramName) {
    const v = map.get(snake);
    if (v !== undefined) return { key: snake, value: v };
  }
  // Case-insensitive fallback over all keys.
  const lower = paramName.toLowerCase();
  for (const [k, v] of map) {
    if (k.toLowerCase() === lower) return { key: k, value: v };
  }
  return null;
}

/** Small icon button to fill a param from a matching project variable. */
function UseVarButton({ paramName, varMap, onApply }: {
  paramName: string;
  varMap: Map<string, string>;
  onApply: (value: string) => void;
}) {
  const match = findVarMatch(paramName, varMap);
  if (!match || !match.value) return null;
  const { key: varName, value: varValue } = match;
  return (
    <button
      onClick={() => onApply(varValue)}
      className="text-[#0969da] hover:text-[#0860ca] shrink-0 p-0.5 rounded hover:bg-[#ddf4ff] transition-colors"
      title={`Use project variable: ${varName} = ${varValue}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.889" />
      </svg>
    </button>
  );
}

/** Small icon button to fill a file input from a matching file project variable. */
function UseFileVarButton({ paramName, fileVarMap, onApply }: {
  paramName: string;
  fileVarMap: Map<string, { sentinel: string; fileName: string; fileSize?: number }>;
  onApply: (sentinel: string, fileName: string) => void;
}) {
  const match = findVarMatch(paramName, fileVarMap);
  if (!match) return null;
  const { key: varName, value: entry } = match;
  return (
    <button
      onClick={() => onApply(entry.sentinel, entry.fileName)}
      className="text-[#0969da] hover:text-[#0860ca] shrink-0 p-0.5 rounded hover:bg-[#ddf4ff] transition-colors"
      title={`Use file variable: ${varName} → ${entry.fileName}${entry.fileSize ? ` (${formatBytes(entry.fileSize)})` : ""}`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.745 3A23.933 23.933 0 0 0 3 12c0 3.183.62 6.22 1.745 9M19.5 3c.967 2.78 1.5 5.817 1.5 9s-.533 6.22-1.5 9M8.25 8.885l1.444-.89a.75.75 0 0 1 1.105.402l2.402 7.206a.75.75 0 0 0 1.104.401l1.445-.889" />
      </svg>
    </button>
  );
}

// ── Schema-aware input control ─────────────────────────────────────────────
//
// Picks the right HTML control based on the JSON Schema:
//   • enum             → <select> dropdown
//   • boolean          → true / false select
//   • integer / number → <input type="number">
//   • string + format=date / date-time → <input type="date" / datetime-local">
//   • everything else  → <input type="text">

function ParamInput({ schema, value, onChange, placeholder, idHint }: {
  schema?: Schema;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  idHint?: string;
}) {
  // Enum → select
  if (schema?.enum && schema.enum.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_BASE}
        aria-label={idHint}
      >
        <option value="">—</option>
        {schema.enum.map((v) => (
          <option key={String(v)} value={String(v)}>{String(v)}</option>
        ))}
      </select>
    );
  }

  // Boolean → true / false select
  if (schema?.type === "boolean") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={SELECT_BASE}
        aria-label={idHint}
      >
        <option value="">—</option>
        <option value="true">true</option>
        <option value="false">false</option>
      </select>
    );
  }

  // Integer / number → numeric input
  if (schema?.type === "integer" || schema?.type === "number") {
    return (
      <input
        type="number"
        step={schema.type === "integer" ? 1 : "any"}
        min={schema.minimum}
        max={schema.maximum}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={INPUT_MONO}
        aria-label={idHint}
      />
    );
  }

  // String + date format
  if (schema?.type === "string" && schema.format === "date") {
    return (
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_MONO}
        aria-label={idHint}
      />
    );
  }
  if (schema?.type === "string" && schema.format === "date-time") {
    return (
      <input
        type="datetime-local"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_MONO}
        aria-label={idHint}
      />
    );
  }

  // Default: text
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={INPUT_MONO}
      aria-label={idHint}
    />
  );
}

// ── File input — matches D360's "Choose File / No file chosen" look ────────

function FileInput({ file, onChange, accept }: {
  file: File | null;
  onChange: (f: File | null) => void;
  accept?: string;
}) {
  return (
    <label className="flex items-center text-sm border border-[#d1d9e0] rounded-md bg-white cursor-pointer overflow-hidden hover:border-[#afb8c1] transition-colors w-[380px] h-[40px]">
      <span className="h-full flex items-center px-3 bg-[#f6f8fa] border-r border-[#d1d9e0] text-[#1f2328] font-medium shrink-0 hover:bg-[#eef1f6]">
        Choose File
      </span>
      <span className={`px-2 truncate flex-1 ${file ? "text-[#1f2328]" : "text-[#656d76]"}`}>
        {file ? `${file.name} (${formatBytes(file.size)})` : "No file chosen"}
      </span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </label>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Form ↔ Raw mode toggle for the body section ────────────────────────────

type BodyMode = "form" | "raw";

function ModeToggle({ mode, onChange }: { mode: BodyMode; onChange: (m: BodyMode) => void }) {
  return (
    <div className="inline-flex items-center border border-[#d1d9e0] rounded-md overflow-hidden">
      {(["form", "raw"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={`text-xs font-medium px-2.5 py-1 transition-colors ${
            mode === m
              ? "bg-[#0969da] text-white"
              : "bg-white text-[#656d76] hover:bg-[#f6f8fa]"
          }`}
        >
          {m === "form" ? "Form" : "Raw"}
        </button>
      ))}
    </div>
  );
}

/**
 * Convert a form-input string into a typed JS value based on schema.
 * Used when serializing a form-mode body into JSON.
 */
function coerceFormValue(value: string, schema?: Schema): unknown {
  if (value === "") return undefined;
  if (!schema) return value;
  if (schema.enum && schema.enum.length > 0) {
    // If the original enum entry is a number and the form value matches as a number, return number
    const found = schema.enum.find((e) => String(e) === value);
    return found ?? value;
  }
  if (schema.type === "boolean") return value === "true";
  if (schema.type === "integer") {
    const n = parseInt(value, 10);
    return Number.isFinite(n) ? n : value;
  }
  if (schema.type === "number") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : value;
  }
  // For object/array, the form stores them as JSON strings — try to parse
  if (schema.type === "object" || schema.type === "array") {
    try { return JSON.parse(value); } catch { return value; }
  }
  return value;
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
        <span className="text-sm font-semibold text-[#656d76] uppercase tracking-wider flex-1">
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

export function TryItPanel({ endpoint, connectionId, baseUrl, canSend, connectionWarning, onOpenConnect, securitySchemes, specPath, versionFolder, onSpecRefresh }: Props) {
  const variables = useProjectVariablesStore((s) => s.variables);

  const [sending, setSending] = useState(false);
  const [response, setResponse] = useState<TryItResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resultTab, setResultTab] = useState<"request" | "response">("response");
  const [enhanceModalOpen, setEnhanceModalOpen] = useState(false);

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

  // File variable lookup — only file-type variables, keyed by name
  const fileVarMap = useMemo(() => {
    const m = new Map<string, { sentinel: string; fileName: string; fileSize?: number }>();
    for (const v of variables) {
      if (v.type === "file" && v.fileName) {
        m.set(v.name, { sentinel: v.value, fileName: v.fileName, fileSize: v.fileSize });
      }
    }
    return m;
  }, [variables]);

  // Collect available examples from the spec
  const examples = useMemo(() => collectExamples(endpoint), [endpoint]);

  // Resolve security schemes referenced by this endpoint
  const securityDetails = useMemo(
    () => resolveEndpointSecurity(endpoint, securitySchemes),
    [endpoint, securitySchemes],
  );

  // ── Body content-type detection ──────────────────────────────────────────
  const contentType = endpoint.requestBody?.contentType?.toLowerCase() ?? "";
  const isMultipart = contentType.includes("multipart/");
  const isFormUrlEncoded = contentType.includes("x-www-form-urlencoded");
  const isJsonBody = !isMultipart && !isFormUrlEncoded && (contentType.includes("json") || (!!endpoint.requestBody && contentType === ""));
  const isFormBody = isMultipart || isFormUrlEncoded;

  // For multipart / urlencoded — flat list of top-level schema properties
  const bodyProperties = useMemo(() => {
    const schema = endpoint.requestBody?.schema;
    if (!schema?.properties) return [];
    const requiredSet = new Set(schema.required ?? []);
    return Object.entries(schema.properties).map(([name, propSchema]) => ({
      name,
      schema: propSchema,
      required: requiredSet.has(name),
      isFile: propSchema.type === "string" && propSchema.format === "binary",
    }));
  }, [endpoint.requestBody]);

  // Initialize param values — blank by default
  const [paramValues, setParamValues] = useState<Record<string, string>>(() => {
    const vals: Record<string, string> = {};
    for (const p of [...pathParams, ...queryParams, ...headerParams]) {
      vals[p.name] = "";
    }
    return vals;
  });

  // Body state — separate channels for raw text / form fields / files
  const [body, setBody] = useState("");
  const [formFields, setFormFields] = useState<Record<string, string>>({});
  const [formFiles, setFormFiles] = useState<Record<string, File | string | null>>({});

  // Form / Raw toggle — defaults to form when properties exist, raw otherwise
  const [bodyMode, setBodyMode] = useState<BodyMode>(
    bodyProperties.length > 0 ? "form" : "raw",
  );

  // Multipart bodies can't be meaningfully edited as raw text (binary boundaries),
  // so the toggle is hidden and mode is locked to "form" for them.
  const showBodyModeToggle = bodyProperties.length > 0 && !isMultipart;

  // Reset everything when endpoint changes
  useEffect(() => {
    const vals: Record<string, string> = {};
    for (const p of [...endpoint.parameters]) {
      vals[p.name] = "";
    }
    setParamValues(vals);
    setBody("");
    setFormFields({});
    setFormFiles({});
    setBodyMode(bodyProperties.length > 0 ? "form" : "raw");
    setResponse(null);
    setError(null);
  }, [endpoint, bodyProperties.length]);

  /**
   * Switch between Form and Raw body editors and best-effort sync state in the
   * direction the user is moving:
   *   • form → raw : serialize current form fields as a pretty JSON object
   *   • raw  → form: parse current raw text as JSON and populate form fields
   */
  function switchBodyMode(target: BodyMode) {
    if (target === bodyMode) return;
    if (target === "raw") {
      const obj: Record<string, unknown> = {};
      for (const prop of bodyProperties) {
        const v = formFields[prop.name];
        if (v == null || v === "") continue;
        const coerced = coerceFormValue(v, prop.schema);
        if (coerced !== undefined) obj[prop.name] = coerced;
      }
      if (Object.keys(obj).length > 0) {
        setBody(JSON.stringify(obj, null, 2));
      }
    } else {
      if (body.trim()) {
        try {
          const parsed = JSON.parse(body);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            const next: Record<string, string> = {};
            for (const [k, v] of Object.entries(parsed)) {
              next[k] = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
            }
            setFormFields((prev) => ({ ...prev, ...next }));
          }
        } catch { /* ignore — leave form fields untouched */ }
      }
    }
    setBodyMode(target);
  }

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
    if (!ex.body) return;

    // If we're in form mode (or the body is multipart, which is form-only),
    // try to populate form fields from the example object.
    if (bodyMode === "form" || isMultipart) {
      try {
        const parsed = JSON.parse(ex.body);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const next: Record<string, string> = {};
          for (const [k, v] of Object.entries(parsed)) {
            next[k] = v == null ? "" : (typeof v === "object" ? JSON.stringify(v) : String(v));
          }
          setFormFields(next);
          // Also stash the example into body so users see it if they switch to Raw
          setBody(ex.body);
          return;
        }
      } catch { /* fall through to raw */ }
    }
    setBody(ex.body);
  }

  // Live URL preview — path params resolved, query params appended, and any
  // API-key security scheme that lives in the query string also surfaced (with
  // a {placeholder} for the credential) so users see exactly what will be hit.
  const previewUrl = useMemo(() => {
    let path = endpoint.path;
    for (const p of pathParams) {
      const val = paramValues[p.name];
      path = path.replace(`{${p.name}}`, val ? val : `{${p.name}}`);
    }
    const queryParts: string[] = [];
    for (const p of queryParams) {
      const val = paramValues[p.name];
      if (val) queryParts.push(`${encodeURIComponent(p.name)}=${encodeURIComponent(val)}`);
    }
    // API-key security scheme delivered via query → e.g. ?code={functionKey}
    for (const { name, scheme } of securityDetails) {
      if (scheme.type === "apiKey" && scheme.in?.toLowerCase() === "query" && scheme.name) {
        queryParts.push(`${scheme.name}={${name}}`);
      }
    }
    const qs = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    return `${baseUrl ?? ""}${path}${qs}`;
  }, [endpoint.path, paramValues, baseUrl, pathParams, queryParams, securityDetails]);

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
      if (connectionId) headers["X-FF-Connection-Id"] = connectionId;
      if (baseUrl) headers["X-FF-Base-Url"] = baseUrl;

      for (const p of headerParams) {
        const val = paramValues[p.name];
        if (val) headers[p.name] = val;
      }

      // Build the body based on the detected content type and active body mode
      let fetchBody: BodyInit | undefined;
      let bodyPreview: string | null = null;

      if (isMultipart) {
        // Check if any file field uses a sentinel (file project variable)
        const hasSentinel = Object.values(formFiles).some(v => typeof v === "string");

        if (hasSentinel) {
          // Send as JSON with X-FF-Content-Type — proxy resolves file sentinels server-side
          const jsonBody: Record<string, string> = {};
          const previewLines: string[] = [];
          for (const [k, v] of Object.entries(formFields)) {
            if (v !== "") { jsonBody[k] = v; previewLines.push(`${k}: ${v}`); }
          }
          for (const [k, v] of Object.entries(formFiles)) {
            if (typeof v === "string") {
              jsonBody[k] = v;
              const fv = variables.find(pv => pv.value === v);
              previewLines.push(`${k}: [variable] ${fv?.fileName ?? k}`);
            } else if (v) {
              // Can't mix real File with sentinel — show error
              previewLines.push(`${k}: [file] ${v.name} (${formatBytes(v.size)})`);
            }
          }
          fetchBody = JSON.stringify(jsonBody);
          bodyPreview = previewLines.join("\n");
          headers["Content-Type"] = "application/json";
          headers["X-FF-Content-Type"] = "multipart/form-data";
        } else {
          // Standard multipart — build real FormData
          const fd = new FormData();
          const previewLines: string[] = [];
          for (const [k, v] of Object.entries(formFields)) {
            if (v !== "") {
              fd.append(k, v);
              previewLines.push(`${k}: ${v}`);
            }
          }
          for (const [k, file] of Object.entries(formFiles)) {
            if (file && file instanceof File) {
              fd.append(k, file);
              previewLines.push(`${k}: [file] ${file.name} (${formatBytes(file.size)})`);
            }
          }
          if (previewLines.length > 0) {
            fetchBody = fd;
            bodyPreview = previewLines.join("\n");
          }
          // NOTE: do NOT set Content-Type — the browser adds it with the correct boundary.
        }
      } else if (bodyMode === "raw") {
        // Raw mode — send the editor text verbatim
        if (body.trim()) {
          fetchBody = body;
          bodyPreview = body;
          headers["Content-Type"] = endpoint.requestBody?.contentType || "application/json";
        }
      } else if (isFormUrlEncoded) {
        const params = new URLSearchParams();
        for (const [k, v] of Object.entries(formFields)) {
          if (v !== "") params.append(k, v);
        }
        const encoded = params.toString();
        if (encoded) {
          fetchBody = encoded;
          bodyPreview = encoded;
          headers["Content-Type"] = "application/x-www-form-urlencoded";
        }
      } else if (isJsonBody && bodyProperties.length > 0) {
        // Form mode for JSON — coerce form values into a typed object and stringify
        const obj: Record<string, unknown> = {};
        for (const prop of bodyProperties) {
          const v = formFields[prop.name];
          if (v == null || v === "") continue;
          const coerced = coerceFormValue(v, prop.schema);
          if (coerced !== undefined) obj[prop.name] = coerced;
        }
        if (Object.keys(obj).length > 0) {
          const json = JSON.stringify(obj);
          fetchBody = json;
          bodyPreview = JSON.stringify(obj, null, 2);
          headers["Content-Type"] = endpoint.requestBody?.contentType || "application/json";
        }
      } else if (body.trim()) {
        // Fallback: text/plain, application/xml, JSON without properties — send raw text
        fetchBody = body;
        bodyPreview = body;
        headers["Content-Type"] = endpoint.requestBody?.contentType || "application/json";
      }

      const res = await fetch(fetchUrl, {
        method: endpoint.method.toUpperCase(),
        headers,
        body: fetchBody,
      });

      const durationMs = Date.now() - start;
      const responseHeaders: Record<string, string> = {};
      res.headers.forEach((v, k) => { responseHeaders[k] = v; });

      let respBody: unknown = null;
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("json")) {
        try { respBody = await res.json(); } catch { respBody = null; }
      } else {
        const text = await res.text();
        respBody = text || null;
      }

      setResponse({
        status: res.status,
        statusText: res.statusText,
        requestHeaders: { ...headers },
        requestBody: bodyPreview,
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

        {/* ── Authentication ───────────────────────────────────────── */}
        {securityDetails.length > 0 && (
          <Accordion
            title="Authentication"
            defaultOpen={false}
            badge={
              <svg className="w-3.5 h-3.5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            }
          >
            <div className="px-3 py-2.5 space-y-3">
              {securityDetails.map(({ name, scheme }, i) => {
                const typeLabel = formatSchemeType(scheme);
                const locLabel = formatSchemeLocation(scheme);
                return (
                  <div key={i} className="space-y-1.5">
                    <div className="text-sm">
                      <span className="font-semibold text-[#1f2328]">{typeLabel}: </span>
                      <span className="font-mono text-[#1f2328]">{name}</span>
                    </div>
                    {locLabel && scheme.name && (
                      <div className="text-sm text-[#656d76] flex items-center gap-1.5 flex-wrap">
                        <span>{locLabel}</span>
                        <InlineCode>{scheme.name}</InlineCode>
                      </div>
                    )}
                    {scheme.description && (
                      <p className="text-sm text-[#656d76] leading-relaxed">
                        <InlineMarkdown text={scheme.description} />
                      </p>
                    )}
                  </div>
                );
              })}
              <p className="text-xs text-[#656d76] pt-1 border-t border-[#d1d9e0]">
                Credentials are managed in{" "}
                <Link to="/settings/connections" className="text-[#0969da] hover:underline">
                  Settings → Connections
                </Link>
                {" "}and injected by the proxy on Send.
              </p>
            </div>
          </Accordion>
        )}

        {/* ── URL preview ──────────────────────────────────────────── */}
        <div className="space-y-1">
          <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide">URL</label>
          <div className="font-mono text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-1.5 break-all select-all">
            {previewUrl || <span className="text-[#afb8c1]">{endpoint.path}</span>}
          </div>
        </div>

        {/* ── Examples dropdown ─────────────────────────────────────── */}
        {examples.length > 0 && (
          <div className="flex items-center gap-2">
            <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide shrink-0">Examples</label>
            <select
              onChange={(e) => {
                const idx = parseInt(e.target.value);
                if (!isNaN(idx) && examples[idx]) applyExample(examples[idx]);
                e.target.value = "";
              }}
              defaultValue=""
              className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2 py-1.5 outline-none focus:border-[#0969da] cursor-pointer"
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
            <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide block">Path parameters</label>
            <div className="border border-[#d1d9e0] rounded-lg p-4 flex flex-col items-center space-y-3">
              {pathParams.map((p) => (
                <div key={p.name} className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-mono text-[#1f2328]">
                      {p.name}
                      {p.required && <span className="text-[#d1242f] ml-0.5">*</span>}
                    </span>
                    {p.schema?.type && (
                      <span className="text-xs text-[#656d76]">
                        {p.schema.enum ? "enum" : p.schema.type}
                        {!p.schema.enum && p.schema.format ? ` (${p.schema.format})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <ParamInput
                      schema={p.schema}
                      value={paramValues[p.name] ?? ""}
                      onChange={(v) => updateParam(p.name, v)}
                      placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
                      idHint={p.name}
                    />
                    <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Query Parameters ─────────────────────────────────────── */}
        {queryParams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide block">Query parameters</label>
            <div className="border border-[#d1d9e0] rounded-lg p-4 flex flex-col items-center space-y-3">
              {queryParams.map((p) => (
                <div key={p.name} className="space-y-0.5">
                  <div className="flex items-center gap-1">
                    <span className="text-sm font-mono text-[#1f2328]">
                      {p.name}
                      {p.required && <span className="text-[#d1242f] ml-0.5">*</span>}
                    </span>
                    {p.schema?.type && (
                      <span className="text-xs text-[#656d76]">
                        {p.schema.enum ? "enum" : p.schema.type}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <ParamInput
                      schema={p.schema}
                      value={paramValues[p.name] ?? ""}
                      onChange={(v) => updateParam(p.name, v)}
                      placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
                      idHint={p.name}
                    />
                    <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Header Parameters ────────────────────────────────────── */}
        {headerParams.length > 0 && (
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide block">Headers</label>
            <div className="border border-[#d1d9e0] rounded-lg p-4 flex flex-col items-center space-y-3">
              {headerParams.map((p) => (
                <div key={p.name} className="space-y-0.5">
                  <span className="text-sm font-mono text-[#1f2328]">{p.name}</span>
                  <div className="flex items-center gap-1">
                    <ParamInput
                      schema={p.schema}
                      value={paramValues[p.name] ?? ""}
                      onChange={(v) => updateParam(p.name, v)}
                      placeholder={p.schema?.example != null ? String(p.schema.example) : p.schema?.type ?? ""}
                      idHint={p.name}
                    />
                    <UseVarButton paramName={p.name} varMap={varMap} onApply={(v) => updateParam(p.name, v)} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Request Body ─────────────────────────────────────────── */}
        {endpoint.requestBody && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <label className="text-sm font-semibold text-[#656d76] uppercase tracking-wide">Request body</label>
                <span className="text-xs font-mono text-[#656d76]">{endpoint.requestBody.contentType}</span>
              </div>
              {showBodyModeToggle && (
                <ModeToggle mode={bodyMode} onChange={switchBodyMode} />
              )}
            </div>

            {/* Form mode — flat field-by-field form (always used for multipart) */}
            {(bodyMode === "form" || isMultipart) && bodyProperties.length > 0 ? (
              <div className="border border-[#d1d9e0] rounded-lg p-4 flex flex-col items-center space-y-3">
                {bodyProperties.map((prop) => (
                  <div key={prop.name} className="space-y-0.5">
                    <div className="flex items-center gap-1">
                      <span className="text-sm font-mono text-[#1f2328]">
                        {prop.name}
                        {prop.required && <span className="text-[#d1242f] ml-0.5">*</span>}
                      </span>
                      <span className="text-xs text-[#656d76]">
                        {prop.schema.enum
                          ? "enum"
                          : prop.isFile
                            ? "file"
                            : prop.schema.type ?? "string"}
                        {prop.schema.format && !prop.isFile && !prop.schema.enum ? ` (${prop.schema.format})` : ""}
                      </span>
                    </div>
                    {prop.isFile ? (
                      <div className="flex items-center gap-1">
                        {typeof formFiles[prop.name] === "string" ? (
                          <div className="flex items-center text-sm border border-[#d1d9e0] rounded-md bg-white w-[380px] h-[40px] overflow-hidden">
                            <span className="h-full flex items-center px-3 bg-[#ddf4ff] border-r border-[#d1d9e0] text-[#0969da] font-medium shrink-0">
                              Variable
                            </span>
                            <span className="px-2 truncate flex-1 text-[#1f2328]">
                              {variables.find(v => v.value === formFiles[prop.name])?.fileName ?? prop.name}
                            </span>
                            <button
                              onClick={() => setFormFiles((prev) => ({ ...prev, [prop.name]: null }))}
                              className="px-2 text-[#656d76] hover:text-[#d1242f] shrink-0"
                              title="Clear"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ) : (
                          <FileInput
                            file={(formFiles[prop.name] as File) ?? null}
                            onChange={(f) => setFormFiles((prev) => ({ ...prev, [prop.name]: f }))}
                          />
                        )}
                        <UseFileVarButton
                          paramName={prop.name}
                          fileVarMap={fileVarMap}
                          onApply={(sentinel) => setFormFiles((prev) => ({ ...prev, [prop.name]: sentinel }))}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <ParamInput
                          schema={prop.schema}
                          value={formFields[prop.name] ?? ""}
                          onChange={(v) => setFormFields((prev) => ({ ...prev, [prop.name]: v }))}
                          placeholder={prop.schema.example != null ? String(prop.schema.example) : prop.schema.type ?? ""}
                          idHint={prop.name}
                        />
                        <UseVarButton
                          paramName={prop.name}
                          varMap={varMap}
                          onApply={(v) => setFormFields((prev) => ({ ...prev, [prop.name]: v }))}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : isJsonBody ? (
              <JsonEditor
                value={body}
                onChange={setBody}
                height="12rem"
                placeholder="{}"
              />
            ) : (
              // Fallback for text/plain, application/xml, etc — plain textarea
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={8}
                className="w-full text-sm border border-[#d1d9e0] rounded-md px-2 py-1.5 bg-white text-[#1f2328] outline-none focus:border-[#0969da] font-mono"
                placeholder="Request body"
              />
            )}
          </div>
        )}

        {/* ── Send + Enhance buttons ───────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
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

          {response && specPath && versionFolder && (
            <button
              onClick={() => setEnhanceModalOpen(true)}
              title="Use this captured request and response to update the example in the spec MD file"
              className="flex items-center gap-2 border border-[#d1d9e0] hover:bg-[#f6f8fa] text-[#1f2328] text-sm font-medium rounded-md px-3 py-2 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.847-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.847.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.456-2.456L14.25 6l1.035-.259a3.375 3.375 0 0 0 2.456-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
              </svg>
              Enhance Docs example
            </button>
          )}
        </div>

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
                  <p className="text-sm font-semibold text-[#656d76] uppercase tracking-wider mb-1.5">Request URL</p>
                  <div className="font-mono text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-3 py-2 break-all">
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
                      {isFormBody ? (
                        <pre className="text-sm font-mono text-[#1f2328] whitespace-pre-wrap break-all px-3 py-2">{response.requestBody}</pre>
                      ) : (
                        <JsonCodeBlock value={(() => { try { return JSON.parse(response.requestBody!); } catch { return response.requestBody; } })()} height="28rem" />
                      )}
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
                      <p className="text-sm text-[#afb8c1] italic px-3 py-2">No content</p>
                    )}
                  </div>
                </Accordion>
              </div>
            )}
          </div>
        )}
      </div>

      {response && specPath && versionFolder && (
        <EnhanceDocsExampleModal
          open={enhanceModalOpen}
          onClose={() => setEnhanceModalOpen(false)}
          onSaved={onSpecRefresh}
          request={{
            specPath,
            versionFolder,
            method: endpoint.method,
            pathTemplate: endpoint.path,
            capturedUrl: response.requestUrl,
            capturedStatus: response.status,
            requestHeaders: response.requestHeaders,
            requestBody: response.requestBody,
            requestContentType: response.requestHeaders["Content-Type"] ?? response.requestHeaders["content-type"],
            responseHeaders: response.responseHeaders,
            responseBody: response.body,
            responseContentType: response.responseHeaders["Content-Type"] ?? response.responseHeaders["content-type"],
          }}
        />
      )}
    </div>
  );
}
