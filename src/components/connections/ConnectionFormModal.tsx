import { useState } from "react";
import { useConnectionsStore } from "../../store/connections.store";
import type { Connection, ConnectionProvider } from "../../lib/api/connectionsApi";

interface ConnectionFormModalProps {
  connection?: Connection;
  onClose: () => void;
}

const PROVIDER_OPTIONS: { value: ConnectionProvider; label: string; description: string }[] = [
  { value: "oauth2", label: "OAuth 2.0", description: "Authorization Code (PKCE)" },
  { value: "bearer", label: "Bearer Token", description: "Static bearer token" },
  { value: "apikey_header", label: "API Key (Header)", description: "API key sent as a custom header" },
  { value: "apikey_query", label: "API Key (Query)", description: "API key appended as query parameter" },
  { value: "basic", label: "Basic Auth", description: "Base64-encoded username:password" },
  { value: "cookie", label: "Session Cookie", description: "Raw cookie string" },
];

export function ConnectionFormModal({ connection, onClose }: ConnectionFormModalProps) {
  const { add, update } = useConnectionsStore();
  const isEdit = !!connection;

  const [provider, setProvider] = useState<ConnectionProvider>(connection?.provider ?? "oauth2");
  const [name, setName] = useState(connection?.name ?? "");
  const [baseUrl, setBaseUrl] = useState(connection?.baseUrl ?? "");
  const [apiVersion, setApiVersion] = useState(connection?.apiVersion ?? "");

  // OAuth fields
  const [authorizationUrl, setAuthorizationUrl] = useState(connection?.authorizationUrl ?? "");
  const [tokenUrl, setTokenUrl] = useState(connection?.tokenUrl ?? "");
  const [clientId, setClientId] = useState(connection?.clientId ?? "");
  const [clientSecret, setClientSecret] = useState("");
  const [scopes, setScopes] = useState(connection?.scopes ?? "");

  // Token-based fields
  const [credential, setCredential] = useState("");
  const [authHeaderName, setAuthHeaderName] = useState(connection?.authHeaderName ?? "");
  const [authQueryParam, setAuthQueryParam] = useState(connection?.authQueryParam ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectUri = "/callback";

  const isOAuth = provider === "oauth2";

  const canSave = (() => {
    if (!name.trim()) return false;
    if (isOAuth) {
      return !!(authorizationUrl.trim() && tokenUrl.trim() && clientId.trim());
    }
    // Token-based: credential required on create, optional on edit (keep existing)
    if (!isEdit && !credential.trim()) return false;
    if (provider === "apikey_header" && !authHeaderName.trim()) return false;
    if (provider === "apikey_query" && !authQueryParam.trim()) return false;
    return true;
  })();

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      if (isEdit) {
        const payload: Record<string, string | undefined> = {
          name: name.trim(),
          baseUrl: baseUrl.trim() || undefined,
          apiVersion: apiVersion.trim() || undefined,
        };
        if (isOAuth) {
          payload.authorizationUrl = authorizationUrl.trim();
          payload.tokenUrl = tokenUrl.trim();
          payload.clientId = clientId.trim();
          payload.scopes = scopes.trim();
          if (clientSecret.trim()) payload.clientSecret = clientSecret.trim();
        } else {
          if (credential.trim()) payload.credential = credential.trim();
          if (provider === "apikey_header") payload.authHeaderName = authHeaderName.trim();
          if (provider === "apikey_query") payload.authQueryParam = authQueryParam.trim();
        }
        await update(connection.id, payload);
      } else {
        await add({
          name: name.trim(),
          provider,
          baseUrl: baseUrl.trim() || undefined,
          apiVersion: apiVersion.trim() || undefined,
          ...(isOAuth ? {
            authorizationUrl: authorizationUrl.trim(),
            tokenUrl: tokenUrl.trim(),
            clientId: clientId.trim(),
            clientSecret: clientSecret.trim() || undefined,
            scopes: scopes.trim() || undefined,
          } : {
            credential: credential.trim(),
            ...(provider === "apikey_header" ? { authHeaderName: authHeaderName.trim() } : {}),
            ...(provider === "apikey_query" ? { authQueryParam: authQueryParam.trim() } : {}),
          }),
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const providerInfo = PROVIDER_OPTIONS.find((p) => p.value === provider);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[520px] max-w-[95vw] max-h-[90vh] flex flex-col"
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
              {isEdit ? "Edit Connection" : "New Connection"}
            </h2>
            <p className="text-xs text-[#656d76]">
              {providerInfo?.description ?? "Configure authentication"}
            </p>
          </div>
          <div className="flex-1" />
          <button onClick={onClose} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-3.5">
          {/* Provider selector — only on create */}
          {!isEdit && (
            <Field label="Auth Type" required>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ConnectionProvider)}
                className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
              >
                {PROVIDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Show provider badge when editing */}
          {isEdit && (
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-[#656d76]">Type:</span>
              <ProviderBadge provider={connection.provider} />
            </div>
          )}

          <Field label="Connection Name" required>
            <input
              className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Document360, Stripe, GitHub"
            />
          </Field>

          <Field label="Base URL" hint="The upstream API base URL">
            <input
              className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.example.com"
            />
          </Field>

          <Field label="API Version" hint="Version prefix for API paths (e.g. v2, v3)">
            <input
              className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              placeholder="v2"
            />
          </Field>

          {/* OAuth-specific fields */}
          {isOAuth && (
            <>
              <Field label="Authorization URL" required>
                <input
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={authorizationUrl}
                  onChange={(e) => setAuthorizationUrl(e.target.value)}
                  placeholder="https://provider.com/oauth/authorize"
                />
              </Field>

              <Field label="Token URL" required>
                <input
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={tokenUrl}
                  onChange={(e) => setTokenUrl(e.target.value)}
                  placeholder="https://provider.com/oauth/token"
                />
              </Field>

              <Field label="Client ID" required>
                <input
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="your-client-id"
                />
              </Field>

              <Field label="Client Secret" hint={isEdit && connection?.hasSecret ? "Leave blank to keep existing secret" : "Optional for public clients (PKCE)"}>
                <input
                  type="password"
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={isEdit && connection?.hasSecret ? "••••••••" : "Optional"}
                />
              </Field>

              <Field label="Scopes" hint="Space-separated OAuth scopes">
                <input
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={scopes}
                  onChange={(e) => setScopes(e.target.value)}
                  placeholder="openid profile api.read"
                />
              </Field>

              <Field label="Redirect URI" hint="Copy this into your OAuth app settings">
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 font-mono cursor-text"
                    value={`${window.location.origin}${redirectUri}`}
                  />
                  <button
                    onClick={() => { void navigator.clipboard.writeText(`${window.location.origin}${redirectUri}`); }}
                    className="p-1.5 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] rounded-md transition-colors shrink-0"
                    title="Copy to clipboard"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                    </svg>
                  </button>
                </div>
              </Field>
            </>
          )}

          {/* Token-based fields */}
          {!isOAuth && (
            <>
              {provider === "apikey_header" && (
                <Field label="Header Name" required hint="e.g. X-Api-Key, api_token">
                  <input
                    className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                    value={authHeaderName}
                    onChange={(e) => setAuthHeaderName(e.target.value)}
                    placeholder="X-Api-Key"
                  />
                </Field>
              )}

              {provider === "apikey_query" && (
                <Field label="Query Parameter" required hint="e.g. api_key, token">
                  <input
                    className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                    value={authQueryParam}
                    onChange={(e) => setAuthQueryParam(e.target.value)}
                    placeholder="api_key"
                  />
                </Field>
              )}

              <Field
                label="Credential"
                required={!isEdit}
                hint={
                  isEdit && connection?.hasCredential
                    ? "Leave blank to keep existing credential"
                    : provider === "bearer" ? "Paste your bearer token"
                    : provider === "basic" ? "Base64-encoded username:password"
                    : provider === "cookie" ? "Raw cookie string (e.g. session=abc123)"
                    : "Paste your API key"
                }
              >
                <input
                  type="password"
                  className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={isEdit && connection?.hasCredential ? "••••••••" : "Paste credential"}
                />
              </Field>
            </>
          )}

          {error && (
            <div className="p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
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
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-50 border border-[#1f883d]/80"
          >
            {saving ? "Saving…" : isEdit ? "Update" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Simple form field wrapper for consistent layout. */
function Field({ label, required, hint, children }: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-[#1f2328] mb-1">
        {label}
        {required && <span className="text-[#d1242f] ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="text-xs text-[#656d76] mt-0.5">{hint}</p>}
    </div>
  );
}

const PROVIDER_BADGE_STYLES: Record<ConnectionProvider, { bg: string; text: string }> = {
  oauth2: { bg: "bg-[#ddf4ff]", text: "text-[#0969da]" },
  bearer: { bg: "bg-[#dafbe1]", text: "text-[#1a7f37]" },
  apikey_header: { bg: "bg-[#f6f8fa]", text: "text-[#656d76]" },
  apikey_query: { bg: "bg-[#f6f8fa]", text: "text-[#656d76]" },
  basic: { bg: "bg-[#f6f8fa]", text: "text-[#656d76]" },
  cookie: { bg: "bg-[#f6f8fa]", text: "text-[#656d76]" },
};

const PROVIDER_LABELS: Record<ConnectionProvider, string> = {
  oauth2: "OAuth 2.0",
  bearer: "Bearer",
  apikey_header: "API Key",
  apikey_query: "API Key",
  basic: "Basic Auth",
  cookie: "Cookie",
};

export function ProviderBadge({ provider }: { provider: ConnectionProvider }) {
  const style = PROVIDER_BADGE_STYLES[provider];
  return (
    <span className={`px-1.5 py-0.5 text-xs font-medium ${style.bg} ${style.text} rounded-full uppercase tracking-wide shrink-0`}>
      {PROVIDER_LABELS[provider]}
    </span>
  );
}
