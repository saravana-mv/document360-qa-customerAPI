import { useState } from "react";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { useConnectionsStore } from "../../store/connections.store";
import type { AuthType, ScenarioEnvOverride } from "../../store/scenarioOrg.store";

interface ScenarioEnvOverrideModalProps {
  flowPath: string;
  scenarioName: string;
  onClose: () => void;
}

const AUTH_TYPE_OPTIONS: { value: AuthType | ""; label: string }[] = [
  { value: "", label: "Use version default" },
  { value: "bearer", label: "Bearer Token" },
  { value: "apikey_header", label: "API Key (Header)" },
  { value: "apikey_query", label: "API Key (Query Param)" },
  { value: "basic", label: "Basic Auth" },
  { value: "cookie", label: "Session Cookie" },
  { value: "oauth", label: "D360 OAuth" },
  { value: "none", label: "No Auth" },
];

export function ScenarioEnvOverrideModal({ flowPath, scenarioName, onClose }: ScenarioEnvOverrideModalProps) {
  const existing = useScenarioOrgStore((s) => s.scenarioConfigs[flowPath]);
  const setScenarioConfig = useScenarioOrgStore((s) => s.setScenarioConfig);
  const clearScenarioConfig = useScenarioOrgStore((s) => s.clearScenarioConfig);

  // Get version config as reference
  const version = useScenarioOrgStore((s) => s.getVersionForFlow(flowPath));
  const versionConfig = useScenarioOrgStore((s) => version ? s.versionConfigs[version] : undefined);
  const versionConn = useConnectionsStore((s) => versionConfig?.connectionId ? s.connections.find(c => c.id === versionConfig.connectionId) : undefined);
  const effectiveBaseUrl = versionConn?.baseUrl || versionConfig?.baseUrl || "";
  const effectiveApiVersion = versionConn?.apiVersion || versionConfig?.apiVersion || "";

  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl ?? "");
  const [apiVersion, setApiVersion] = useState(existing?.apiVersion ?? "");
  const [authType, setAuthType] = useState<AuthType | "">(existing?.authType ?? "");
  const [authHeaderName, setAuthHeaderName] = useState(existing?.authHeaderName ?? "");
  const [authQueryParam, setAuthQueryParam] = useState(existing?.authQueryParam ?? "");
  const [endpointLabel, setEndpointLabel] = useState(existing?.endpointLabel ?? "");

  const hasOverride = baseUrl || apiVersion || authType || endpointLabel;

  function handleSave() {
    const config: ScenarioEnvOverride = {};
    if (baseUrl.trim()) config.baseUrl = baseUrl.trim();
    if (apiVersion.trim()) config.apiVersion = apiVersion.trim();
    if (authType) config.authType = authType;
    if (authType === "apikey_header" && authHeaderName.trim()) config.authHeaderName = authHeaderName.trim();
    if (authType === "apikey_query" && authQueryParam.trim()) config.authQueryParam = authQueryParam.trim();
    if (endpointLabel.trim()) config.endpointLabel = endpointLabel.trim();

    if (Object.keys(config).length > 0) {
      setScenarioConfig(flowPath, config);
    } else {
      clearScenarioConfig(flowPath);
    }
    onClose();
  }

  function handleClear() {
    clearScenarioConfig(flowPath);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[480px] max-w-[95vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#d1d9e0]">
          <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-[#1f2328] truncate">
              Environment Override
            </h2>
            <p className="text-sm text-[#656d76] truncate">
              {scenarioName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-4">
          <p className="text-sm text-[#656d76]">
            Override the version-level endpoint for this scenario only. Leave fields empty to inherit from the version config
            {versionConfig?.endpointLabel ? ` (${versionConfig.endpointLabel})` : ""}.
          </p>

          {/* Version defaults reference */}
          {versionConfig && (
            <div className="p-2.5 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md">
              <p className="text-sm font-medium text-[#656d76] mb-1.5">Version defaults ({version})</p>
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
                <span className="text-[#656d76]">Base URL</span>
                <span className="text-[#1f2328] font-mono truncate">{effectiveBaseUrl || "—"}</span>
                <span className="text-[#656d76]">API Version</span>
                <span className="text-[#1f2328]">{effectiveApiVersion || "—"}</span>
                <span className="text-[#656d76]">Auth</span>
                <span className="text-[#1f2328]">{versionConfig.authType || "—"}</span>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-[#656d76] w-24 shrink-0">Label</label>
              <input
                className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
                value={endpointLabel}
                onChange={(e) => setEndpointLabel(e.target.value)}
                placeholder="e.g. Staging"
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[#656d76] w-24 shrink-0">Base URL</label>
              <input
                className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={effectiveBaseUrl || "https://api.example.com"}
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[#656d76] w-24 shrink-0">API Version</label>
              <input
                className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                placeholder={versionConfig?.apiVersion || "v2"}
              />
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-[#656d76] w-24 shrink-0">Auth Type</label>
              <select
                value={authType}
                onChange={(e) => setAuthType(e.target.value as AuthType | "")}
                className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
              >
                {AUTH_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {authType === "apikey_header" && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#656d76] w-24 shrink-0">Header Name</label>
                <input
                  className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={authHeaderName}
                  onChange={(e) => setAuthHeaderName(e.target.value)}
                  placeholder="X-Api-Key"
                />
              </div>
            )}

            {authType === "apikey_query" && (
              <div className="flex items-center gap-2">
                <label className="text-sm text-[#656d76] w-24 shrink-0">Param Name</label>
                <input
                  className="flex-1 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] font-mono"
                  value={authQueryParam}
                  onChange={(e) => setAuthQueryParam(e.target.value)}
                  placeholder="api_key"
                />
              </div>
            )}

            {authType && authType !== "none" && authType !== "oauth" && (
              <p className="text-sm text-[#656d76] ml-[6.5rem]">
                Credentials are managed in the version-level Connect Endpoint modal.
                Only the URL routing and auth type are overridden here.
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-2 px-5 py-3.5 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
          {existing && (
            <button
              onClick={handleClear}
              className="text-sm font-medium text-[#d1242f] hover:text-[#d1242f]/80 transition-colors"
            >
              Remove Override
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!hasOverride && !existing}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-50 border border-[#1f883d]/80"
          >
            {existing ? "Update" : "Save Override"}
          </button>
        </div>
      </div>
    </div>
  );
}
