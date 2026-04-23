import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useConnectionsStore } from "../store/connections.store";
import { Spinner } from "../components/common/Spinner";
import { ConnectionFormModal } from "../components/connections/ConnectionFormModal";
import { startConnectionAuthFlow } from "../lib/oauth/flow";
import type { Connection } from "../lib/api/connectionsApi";

export function ConnectionsPage() {
  const { connections, authStatus, loading, error, load, remove, fetchStatus, disconnect } = useConnectionsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { void load(); }, [load]);

  // Handle ?connected= or ?error= query params after OAuth callback
  useEffect(() => {
    const connectedId = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connectedId) {
      // Refresh status for the newly connected connection
      void fetchStatus(connectedId);
      setSearchParams({}, { replace: true });
    }
    if (oauthError) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchStatus]);

  async function handleConnect(conn: Connection) {
    setConnecting(conn.id);
    try {
      await startConnectionAuthFlow({
        id: conn.id,
        authorizationUrl: conn.authorizationUrl,
        clientId: conn.clientId,
        scopes: conn.scopes || "",
        redirectUri: `/oauth/callback/${conn.id}`,
      });
      // Page will redirect — no need to clear state
    } catch (e) {
      alert(`Failed to start OAuth flow: ${e instanceof Error ? e.message : String(e)}`);
      setConnecting(null);
    }
  }

  async function handleDisconnect(conn: Connection) {
    if (!window.confirm(`Disconnect "${conn.name}"?\n\nThis will revoke the stored tokens.`)) return;
    setDisconnecting(conn.id);
    try {
      await disconnect(conn.id);
    } catch (e) {
      alert(`Failed to disconnect: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDisconnecting(null);
    }
  }

  function getStatusBadge(connId: string) {
    const status = authStatus[connId];
    if (!status) {
      return { label: "Not connected", color: "bg-[#656d76]", textColor: "text-[#656d76]" };
    }
    if (!status.authenticated) {
      return { label: "Not connected", color: "bg-[#656d76]", textColor: "text-[#656d76]" };
    }
    if (status.expired) {
      return { label: "Expired", color: "bg-[#bf8700]", textColor: "text-[#bf8700]" };
    }
    return { label: "Connected", color: "bg-[#1a7f37]", textColor: "text-[#1a7f37]" };
  }

  async function handleDelete(conn: Connection) {
    if (!window.confirm(`Delete connection "${conn.name}"?\n\nScenarios using this connection will need to be reconfigured.`)) return;
    setDeleting(conn.id);
    try {
      await remove(conn.id);
    } catch (e) {
      alert(`Failed to delete: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-sm font-bold text-[#1f2328]">Connections</h1>
            <p className="text-xs text-[#656d76] mt-1">
              Register OAuth apps to authenticate FlowForge against external APIs.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
          >
            New connection
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && connections.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Spinner size="md" className="text-[#656d76]" />
          </div>
        )}

        {/* Empty state */}
        {!loading && connections.length === 0 && (
          <div className="border border-[#d1d9e0] rounded-lg p-8 text-center bg-[#f6f8fa]">
            <svg className="w-10 h-10 text-[#656d76] mx-auto mb-3" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
            </svg>
            <p className="text-sm font-medium text-[#1f2328] mb-1">No connections yet</p>
            <p className="text-xs text-[#656d76] mb-4">
              Create a connection to authenticate against your API using OAuth 2.0.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
            >
              New connection
            </button>
          </div>
        )}

        {/* Connection list */}
        {connections.length > 0 && (
          <div className="border border-[#d1d9e0] rounded-lg divide-y divide-[#d1d9e0] bg-white">
            {connections.map((conn) => (
              <div key={conn.id} className="px-4 py-3 flex items-center gap-3 hover:bg-[#f6f8fa] transition-colors">
                {/* Icon */}
                <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
                  </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[#1f2328] truncate">{conn.name}</span>
                    <span className="px-1.5 py-0.5 text-xs font-medium bg-[#ddf4ff] text-[#0969da] rounded-full uppercase tracking-wide">
                      OAuth 2.0
                    </span>
                    {(() => {
                      const badge = getStatusBadge(conn.id);
                      return (
                        <span className={`flex items-center gap-1 text-xs ${badge.textColor}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${badge.color}`} />
                          {badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs text-[#656d76] font-mono truncate">{conn.clientId}</span>
                    {conn.hasSecret && (
                      <span className="text-xs text-[#656d76] flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                        </svg>
                        Secret stored
                      </span>
                    )}
                    {authStatus[conn.id]?.hasRefreshToken && (
                      <span className="text-xs text-[#656d76] flex items-center gap-1">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                        </svg>
                        Refresh token
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* Connect / Disconnect button */}
                  {authStatus[conn.id]?.authenticated ? (
                    <button
                      onClick={() => void handleDisconnect(conn)}
                      disabled={disconnecting === conn.id}
                      className="px-2.5 py-1 text-xs font-medium text-[#656d76] bg-white border border-[#d1d9e0] rounded-md hover:bg-[#f6f8fa] hover:border-[#bbc0c5] transition-colors disabled:opacity-50"
                      title="Disconnect"
                    >
                      {disconnecting === conn.id ? "..." : "Disconnect"}
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleConnect(conn)}
                      disabled={connecting === conn.id}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-[#0969da] rounded-md hover:bg-[#0969da]/90 transition-colors disabled:opacity-50"
                      title="Connect via OAuth"
                    >
                      {connecting === conn.id ? "..." : "Connect"}
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(conn)}
                    className="p-1.5 text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] rounded-md transition-colors"
                    title="Edit connection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void handleDelete(conn)}
                    disabled={deleting === conn.id}
                    className="p-1.5 text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] rounded-md transition-colors disabled:opacity-50"
                    title="Delete connection"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 00-7.5 0" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Redirect URI help text */}
        {connections.length > 0 && (
          <div className="mt-4 p-3 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md">
            <p className="text-xs text-[#656d76]">
              <strong className="text-[#1f2328]">Redirect URI:</strong> When registering your OAuth app with the API provider,
              set the redirect URI to your FlowForge instance URL + the path shown in the connection details (e.g.{" "}
              <code className="bg-white px-1 rounded text-[#1f2328]">https://your-app.azurestaticapps.net/oauth/callback/&lt;id&gt;</code>).
            </p>
          </div>
        )}
      </div>

      {/* Create / Edit modal */}
      {showCreate && (
        <ConnectionFormModal onClose={() => setShowCreate(false)} />
      )}
      {editing && (
        <ConnectionFormModal connection={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
