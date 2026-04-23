import { useState, useEffect } from "react";
import { parseCurl, maskCredential, authTypeLabel } from "../../lib/curlParser";
import type { CurlParseResult } from "../../lib/curlParser";
import { saveCredential, deleteCredential, getVersionAuthStatus } from "../../lib/api/versionAuthApi";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import type { AuthType, VersionConfig } from "../../store/scenarioOrg.store";

interface ConnectEndpointModalProps {
  version: string;
  onClose: () => void;
}

type Tab = "curl" | "manual";

const AUTH_TYPE_OPTIONS: { value: AuthType; label: string }[] = [
  { value: "bearer", label: "Bearer Token" },
  { value: "apikey_header", label: "API Key (Header)" },
  { value: "apikey_query", label: "API Key (Query Param)" },
  { value: "basic", label: "Basic Auth" },
  { value: "cookie", label: "Session Cookie" },
  { value: "oauth", label: "D360 OAuth" },
  { value: "none", label: "No Auth" },
];

export function ConnectEndpointModal({ version, onClose }: ConnectEndpointModalProps) {
  const versionConfig = useScenarioOrgStore((s) => s.versionConfigs[version]);
  const setVersionConfig = useScenarioOrgStore((s) => s.setVersionConfig);

  const [tab, setTab] = useState<Tab>("curl");
  const [curlInput, setCurlInput] = useState("");
  const [parsed, setParsed] = useState<CurlParseResult | null>(null);

  // Manual form state
  const [baseUrl, setBaseUrl] = useState(versionConfig?.baseUrl ?? "");
  const [apiVersion, setApiVersion] = useState(versionConfig?.apiVersion ?? "");
  const [authType, setAuthType] = useState<AuthType>(versionConfig?.authType ?? "none");
  const [credential, setCredential] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState(versionConfig?.authHeaderName ?? "");
  const [authQueryParam, setAuthQueryParam] = useState(versionConfig?.authQueryParam ?? "");
  const [endpointLabel, setEndpointLabel] = useState(versionConfig?.endpointLabel ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Check current auth status on mount
  const [serverConfigured, setServerConfigured] = useState(versionConfig?.credentialConfigured ?? false);
  useEffect(() => {
    getVersionAuthStatus(version)
      .then((s) => setServerConfigured(s.configured))
      .catch(() => { /* ignore */ });
  }, [version]);

  function handleParseCurl() {
    if (!curlInput.trim()) return;
    const result = parseCurl(curlInput);
    setParsed(result);
    // Auto-fill manual form from parsed result
    if (result.baseUrl) setBaseUrl(result.baseUrl);
    if (result.apiVersion) setApiVersion(result.apiVersion);
    setAuthType(result.authType);
    setCredential(result.credential);
    if (result.authHeaderName) setAuthHeaderName(result.authHeaderName);
    if (result.authQueryParam) setAuthQueryParam(result.authQueryParam);
    if (result.baseUrl) {
      try {
        const host = new URL(result.baseUrl).hostname;
        setEndpointLabel(host);
      } catch { /* ignore */ }
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // Save credential server-side (if not "none" or "oauth")
      const needsServerCred = authType !== "none" && authType !== "oauth";
      if (needsServerCred && credential.trim()) {
        await saveCredential({
          version,
          authType,
          credential: credential.trim(),
          authHeaderName: authType === "apikey_header" ? authHeaderName || undefined : undefined,
          authQueryParam: authType === "apikey_query" ? authQueryParam || undefined : undefined,
        });
      }

      // Update version config in store
      const config: VersionConfig = {
        baseUrl: baseUrl.trim(),
        apiVersion: apiVersion.trim(),
        authType,
        authHeaderName: authType === "apikey_header" ? authHeaderName : undefined,
        authQueryParam: authType === "apikey_query" ? authQueryParam : undefined,
        credentialConfigured: needsServerCred && !!credential.trim(),
        endpointLabel: endpointLabel.trim() || undefined,
      };
      setVersionConfig(version, config);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true);
    setError(null);
    try {
      await deleteCredential(version);
      const config: VersionConfig = {
        baseUrl: "",
        apiVersion: "",
        authType: "none",
        credentialConfigured: false,
      };
      setVersionConfig(version, config);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDisconnecting(false);
    }
  }

  const isConnected = versionConfig?.credentialConfigured || versionConfig?.authType === "oauth";
  const canSave = baseUrl.trim() && (authType === "none" || authType === "oauth" || credential.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[560px] max-w-[95vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#d1d9e0]">
          <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
            </svg>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-[#1f2328]">
              Connect Endpoint — {version}
            </h2>
            <p className="text-xs text-[#656d76]">
              Configure how FlowForge connects to your API
            </p>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#d1d9e0]">
          <button
            onClick={() => setTab("curl")}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "curl"
                ? "text-[#0969da] border-b-2 border-[#0969da] bg-white"
                : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
              Paste cURL
            </span>
          </button>
          <button
            onClick={() => setTab("manual")}
            className={`flex-1 px-4 py-2.5 text-xs font-medium transition-colors ${
              tab === "manual"
                ? "text-[#0969da] border-b-2 border-[#0969da] bg-white"
                : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
            }`}
          >
            <span className="flex items-center justify-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
              </svg>
              Manual
            </span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* cURL Tab */}
          {tab === "curl" && (
            <>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1.5">
                  Paste a cURL command from your API
                </label>
                <textarea
                  value={curlInput}
                  onChange={(e) => { setCurlInput(e.target.value); setParsed(null); }}
                  placeholder={`curl -X GET "https://api.example.com/v2/items" \\\n  -H "Authorization: Bearer YOUR_TOKEN"`}
                  className="w-full h-28 px-3 py-2 text-xs font-mono text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] resize-none"
                />
                <button
                  onClick={handleParseCurl}
                  disabled={!curlInput.trim()}
                  className="mt-2 px-3 py-1.5 text-xs font-medium text-white bg-[#0969da] hover:bg-[#0969da]/90 rounded-md transition-colors disabled:opacity-50 border border-[#0969da]/80"
                >
                  Parse
                </button>
              </div>

              {/* Parsed result */}
              {parsed && (
                <div className="p-3 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md space-y-2">
                  <div className="flex items-center gap-2">
                    {parsed.warnings.length === 0 ? (
                      <span className="w-2 h-2 rounded-full bg-[#1a7f37] shrink-0" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-[#9a6700] shrink-0" />
                    )}
                    <span className="text-xs font-medium text-[#1f2328]">
                      {parsed.warnings.length === 0 ? "Parsed successfully" : "Parsed with warnings"}
                    </span>
                  </div>
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                    <span className="text-[#656d76]">Base URL</span>
                    <span className="text-[#1f2328] font-mono truncate">{parsed.baseUrl || "—"}</span>
                    <span className="text-[#656d76]">API Version</span>
                    <span className="text-[#1f2328]">{parsed.apiVersion || "—"}</span>
                    <span className="text-[#656d76]">Auth Type</span>
                    <span className="text-[#1f2328]">{authTypeLabel(parsed.authType)}</span>
                    {parsed.credential && (
                      <>
                        <span className="text-[#656d76]">Credential</span>
                        <span className="text-[#1f2328] font-mono">{maskCredential(parsed.credential)}</span>
                      </>
                    )}
                    {parsed.authHeaderName && (
                      <>
                        <span className="text-[#656d76]">Header Name</span>
                        <span className="text-[#1f2328] font-mono">{parsed.authHeaderName}</span>
                      </>
                    )}
                    {parsed.authQueryParam && (
                      <>
                        <span className="text-[#656d76]">Query Param</span>
                        <span className="text-[#1f2328] font-mono">{parsed.authQueryParam}</span>
                      </>
                    )}
                  </div>
                  {parsed.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-[#9a6700] flex items-start gap-1.5">
                      <svg className="w-3.5 h-3.5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                      </svg>
                      {w}
                    </p>
                  ))}
                </div>
              )}

              {parsed && parsed.baseUrl && (
                <p className="text-xs text-[#656d76]">
                  The detected values have been pre-filled in the form below. Review and adjust if needed.
                </p>
              )}
            </>
          )}

          {/* Manual form (always visible below cURL result, or as primary in Manual tab) */}
          {(tab === "manual" || (tab === "curl" && parsed?.baseUrl)) && (
            <div className="space-y-3">
              {tab === "manual" && (
                <p className="text-xs text-[#656d76]">
                  Enter your API endpoint details manually.
                </p>
              )}

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#656d76] w-24 shrink-0">Label</label>
                <input
                  className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
                  value={endpointLabel}
                  onChange={(e) => setEndpointLabel(e.target.value)}
                  placeholder="e.g. My API v2"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#656d76] w-24 shrink-0">Base URL</label>
                <input
                  className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-[#656d76] w-24 shrink-0">API Version</label>
                <input
                  className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
                  value={apiVersion}
                  onChange={(e) => setApiVersion(e.target.value)}
                  placeholder="v2"
                />
              </div>

              <div className="flex items-start gap-2">
                <label className="text-xs text-[#656d76] w-24 shrink-0 pt-1.5">Auth Type</label>
                <select
                  value={authType}
                  onChange={(e) => setAuthType(e.target.value as AuthType)}
                  className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
                >
                  {AUTH_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              {/* Auth-specific fields */}
              {authType === "apikey_header" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#656d76] w-24 shrink-0">Header Name</label>
                  <input
                    className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                    value={authHeaderName}
                    onChange={(e) => setAuthHeaderName(e.target.value)}
                    placeholder="X-Api-Key"
                  />
                </div>
              )}

              {authType === "apikey_query" && (
                <div className="flex items-center gap-2">
                  <label className="text-xs text-[#656d76] w-24 shrink-0">Param Name</label>
                  <input
                    className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                    value={authQueryParam}
                    onChange={(e) => setAuthQueryParam(e.target.value)}
                    placeholder="api_key"
                  />
                </div>
              )}

              {authType !== "none" && authType !== "oauth" && (
                <div className="flex items-start gap-2">
                  <label className="text-xs text-[#656d76] w-24 shrink-0 pt-1.5">Credential</label>
                  <div className="flex-1 space-y-1">
                    <input
                      type="password"
                      className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                      value={credential}
                      onChange={(e) => setCredential(e.target.value)}
                      placeholder={
                        authType === "bearer" ? "Paste bearer token" :
                        authType === "basic" ? "Base64-encoded user:pass" :
                        authType === "cookie" ? "session=abc123; other=xyz" :
                        "Paste credential"
                      }
                    />
                    {serverConfigured && !credential && (
                      <p className="text-xs text-[#1a7f37] flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-[#1a7f37] shrink-0" />
                        Credential already stored — leave blank to keep current
                      </p>
                    )}
                  </div>
                </div>
              )}

              {authType === "oauth" && (
                <div className="flex items-center gap-2 ml-[6.5rem]">
                  <span className="w-2 h-2 rounded-full bg-[#0969da] shrink-0" />
                  <span className="text-xs text-[#656d76]">
                    D360 OAuth will be used. Sign in via the refresh button in the header bar.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
          {isConnected && (
            <button
              onClick={() => void handleDisconnect()}
              disabled={disconnecting}
              className="text-xs font-medium text-[#d1242f] hover:text-[#d1242f]/80 transition-colors disabled:opacity-50"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors disabled:opacity-50 border border-[#1a7f37]/80"
          >
            {saving ? "Saving…" : isConnected ? "Update" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
