import { useState, useEffect } from "react";
import { deleteCredential } from "../../lib/api/versionAuthApi";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { useConnectionsStore } from "../../store/connections.store";
import type { VersionConfig } from "../../store/scenarioOrg.store";
import { ProviderBadge } from "../connections/ConnectionFormModal";

interface ConnectEndpointModalProps {
  version: string;
  onClose: () => void;
}

export function ConnectEndpointModal({ version, onClose }: ConnectEndpointModalProps) {
  const versionConfig = useScenarioOrgStore((s) => s.versionConfigs[version]);
  const setVersionConfig = useScenarioOrgStore((s) => s.setVersionConfig);

  const [baseUrl, setBaseUrl] = useState(versionConfig?.baseUrl ?? "");
  const [apiVersion, setApiVersion] = useState(versionConfig?.apiVersion ?? "");
  const [connectionId, setConnectionId] = useState(versionConfig?.connectionId ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);

  // Load connections for the picker
  const { connections, authStatus: connAuthStatus, load: loadConnections } = useConnectionsStore();
  useEffect(() => { void loadConnections(); }, [loadConnections]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const selectedConn = connections.find((c) => c.id === connectionId);
      const config: VersionConfig = {
        baseUrl: baseUrl.trim(),
        apiVersion: apiVersion.trim(),
        authType: selectedConn?.provider === "oauth2" ? "oauth" : connectionId ? (selectedConn?.provider ?? "none") : "none",
        credentialConfigured: !!connectionId && selectedConn?.provider !== "oauth2",
        endpointLabel: selectedConn?.name || undefined,
        connectionId: connectionId || undefined,
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

  const isConnected = !!connectionId || versionConfig?.credentialConfigured || (versionConfig?.authType === "oauth" && !!versionConfig?.connectionId);
  const canSave = !!(baseUrl.trim() || connectionId);

  const selectedConn = connections.find((c) => c.id === connectionId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[480px] max-w-[95vw] max-h-[90vh] flex flex-col"
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

        {/* Body */}
        <div className="flex-1 overflow-auto p-5 space-y-3">
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

          {/* Connection picker */}
          <div className="flex items-start gap-2">
            <label className="text-xs text-[#656d76] w-24 shrink-0 pt-1.5">Connection</label>
            <div className="flex-1 space-y-1.5">
              <select
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
                className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da]"
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

              {/* Status indicator for selected connection */}
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
          </div>

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
              className="text-xs font-medium text-[#d1242f] hover:text-[#d1242f]/80 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {disconnecting ? "Disconnecting…" : "Disconnect"}
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving || !canSave}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer border border-[#1a7f37]/80"
          >
            {saving ? "Saving…" : isConnected ? "Update" : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
