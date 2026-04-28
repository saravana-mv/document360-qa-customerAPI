import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useConnectionsStore } from "../store/connections.store";
import { Spinner } from "../components/common/Spinner";
import { ConnectionFormModal, ProviderBadge } from "../components/connections/ConnectionFormModal";
import { startConnectionAuthFlow } from "../lib/oauth/flow";
import type { Connection } from "../lib/api/connectionsApi";


/** Format ms remaining into human-readable string */
function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMin = minutes % 60;
  if (hours < 24) return remainingMin > 0 ? `${hours}h ${remainingMin}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

/** Format a timestamp to relative time (e.g. "2 minutes ago") */
function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

const STATUS_POLL_INTERVAL = 30_000;

export function ConnectionsPage() {
  const {
    connections, authStatus, healthChecks, loading, error,
    load, remove, fetchStatus, fetchAllStatuses, disconnect,
    refreshToken, runHealthCheck,
  } = useConnectionsStore();
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Connection | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  // Tick counter to force re-render for expiry countdowns
  const [, setTick] = useState(0);

  useEffect(() => { void load(); }, [load]);

  // Handle ?connected= or ?error= query params after OAuth callback
  useEffect(() => {
    const connectedId = searchParams.get("connected");
    const oauthError = searchParams.get("error");
    if (connectedId) {
      void fetchStatus(connectedId);
      setSearchParams({}, { replace: true });
    }
    if (oauthError) {
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, fetchStatus]);

  // Periodic status polling — refresh all statuses every 30s (OAuth only)
  useEffect(() => {
    const oauthConns = connections.filter((c) => c.provider === "oauth2");
    if (oauthConns.length === 0) return;
    const interval = setInterval(() => {
      void fetchAllStatuses();
    }, STATUS_POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [connections, fetchAllStatuses]);

  // Tick every 10s for countdown updates
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = useCallback(async (conn: Connection) => {
    setConnecting(conn.id);
    try {
      await startConnectionAuthFlow({
        id: conn.id,
        authorizationUrl: conn.authorizationUrl!,
        clientId: conn.clientId!,
        scopes: conn.scopes || "",
      });
    } catch (e) {
      alert(`Failed to start OAuth flow: ${e instanceof Error ? e.message : String(e)}`);
      setConnecting(null);
    }
  }, []);

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

  async function handleRefresh(conn: Connection) {
    setRefreshing(conn.id);
    try {
      await refreshToken(conn.id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // OAuthRefreshExpiredError — store already cleared status, just inform user
      if (msg.includes("expired") || msg.includes("revoked") || msg.includes("sign in again")) {
        alert("Refresh token has expired. Please sign in again to reconnect.");
      } else {
        alert(`Refresh failed: ${msg}`);
      }
    } finally {
      setRefreshing(null);
    }
  }

  async function handleHealthCheck(conn: Connection) {
    await runHealthCheck(conn.id);
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

  function getStatusInfo(conn: Connection): {
    label: string;
    dotColor: string;
    textColor: string;
    bgColor: string;
    borderColor: string;
  } {
    // Non-OAuth connections: show "Configured" if credential exists
    if (conn.provider !== "oauth2") {
      if (conn.hasCredential) {
        return { label: "Configured", dotColor: "bg-[#1a7f37]", textColor: "text-[#1a7f37]", bgColor: "bg-[#dafbe1]", borderColor: "border-[#1a7f37]/20" };
      }
      return { label: "No credential", dotColor: "bg-[#656d76]", textColor: "text-[#656d76]", bgColor: "bg-[#f6f8fa]", borderColor: "border-[#d1d9e0]" };
    }

    // OAuth status
    const status = authStatus[conn.id];
    if (!status?.authenticated) {
      return { label: "Not connected", dotColor: "bg-[#656d76]", textColor: "text-[#656d76]", bgColor: "bg-[#f6f8fa]", borderColor: "border-[#d1d9e0]" };
    }
    if (status.expired) {
      if (status.hasRefreshToken) {
        return { label: "Expired (auto-refresh available)", dotColor: "bg-[#bf8700]", textColor: "text-[#bf8700]", bgColor: "bg-[#fff8c5]", borderColor: "border-[#d4a72c]/30" };
      }
      return { label: "Expired", dotColor: "bg-[#d1242f]", textColor: "text-[#d1242f]", bgColor: "bg-[#ffebe9]", borderColor: "border-[#ffcecb]" };
    }
    const expiresInMs = status.expiresAt ? status.expiresAt - Date.now() : 0;
    if (expiresInMs < 300_000 && expiresInMs > 0) {
      return { label: `Expires in ${formatTimeRemaining(expiresInMs)}`, dotColor: "bg-[#bf8700]", textColor: "text-[#bf8700]", bgColor: "bg-[#fff8c5]", borderColor: "border-[#d4a72c]/30" };
    }
    return { label: "Connected", dotColor: "bg-[#1a7f37]", textColor: "text-[#1a7f37]", bgColor: "bg-[#dafbe1]", borderColor: "border-[#1a7f37]/20" };
  }

  function renderConnectionDetail(conn: Connection) {
    // Non-OAuth connections don't need token detail
    if (conn.provider !== "oauth2") return null;

    const status = authStatus[conn.id];
    const hc = healthChecks[conn.id];
    if (!status?.authenticated) return null;

    const expiresInMs = status.expiresAt ? status.expiresAt - Date.now() : 0;

    return (
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {status.expiresAt && (
          <span className="text-xs text-[#656d76] flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            {status.expired
              ? <span className="text-[#d1242f]">Expired {formatRelativeTime(status.expiresAt)}</span>
              : <>Expires in <strong className={expiresInMs < 300_000 ? "text-[#bf8700]" : "text-[#1f2328]"}>{formatTimeRemaining(expiresInMs)}</strong></>}
          </span>
        )}

        {status.hasRefreshToken && (
          <span className="text-xs text-[#1a7f37] flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Auto-refresh enabled
          </span>
        )}
        {!status.hasRefreshToken && status.authenticated && (
          <span className="text-sm text-[#bf8700] flex items-center gap-1">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            No refresh token — re-auth required on expiry
          </span>
        )}

        {status.lastRefreshedAt && (
          <span className="text-xs text-[#656d76]">
            Last refreshed {formatRelativeTime(status.lastRefreshedAt)}
          </span>
        )}

        {hc && !hc.loading && (
          <span className={`text-xs flex items-center gap-1 ${hc.healthy ? "text-[#1a7f37]" : "text-[#d1242f]"}`}>
            {hc.healthy ? (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            ) : (
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            )}
            {hc.healthy ? "Health check passed" : `Health check failed${hc.reason ? `: ${hc.reason}` : ""}`}
            {hc.checkedAt && <span className="text-[#656d76] ml-1">({formatRelativeTime(hc.checkedAt)})</span>}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-sm font-bold text-[#1f2328]">Connections</h1>
            <p className="text-sm text-[#656d76] mt-1">
              Manage reusable authentication connections for your API endpoints. Supports OAuth 2.0, Bearer tokens, API keys, Basic Auth, and cookies.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
          >
            New connection
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
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
            <p className="text-sm text-[#656d76] mb-4">
              Create a connection to authenticate against your API. Supports OAuth 2.0, Bearer tokens, API keys, and more.
            </p>
            <button
              onClick={() => setShowCreate(true)}
              className="px-3 py-1.5 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors border border-[#1a7f37]/80"
            >
              New connection
            </button>
          </div>
        )}

        {/* Connection list */}
        {connections.length > 0 && (
          <div className="border border-[#d1d9e0] rounded-lg divide-y divide-[#d1d9e0] bg-white">
            {connections.map((conn) => {
              const si = getStatusInfo(conn);
              const status = authStatus[conn.id];
              const hcLoading = healthChecks[conn.id]?.loading;
              const isOAuth = conn.provider === "oauth2";

              return (
                <div key={conn.id} className="px-4 py-3 hover:bg-[#f6f8fa]/50 transition-colors">
                  <div className="flex items-center gap-3">
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
                        <ProviderBadge provider={conn.provider} />
                        {/* Status badge */}
                        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium ${si.textColor} ${si.bgColor} border ${si.borderColor} shrink-0`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${si.dotColor}`} />
                          {si.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {isOAuth && conn.clientId && (
                          <span className="text-xs text-[#656d76] font-mono truncate">{conn.clientId}</span>
                        )}
                        {isOAuth && conn.hasSecret && (
                          <span className="text-xs text-[#656d76] flex items-center gap-1 shrink-0">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                            </svg>
                            Secret stored
                          </span>
                        )}
                        {!isOAuth && conn.hasCredential && (
                          <span className="text-xs text-[#656d76] flex items-center gap-1 shrink-0">
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                            </svg>
                            Credential stored
                          </span>
                        )}
                        {conn.provider === "apikey_header" && conn.authHeaderName && (
                          <span className="text-xs text-[#656d76] font-mono truncate">Header: {conn.authHeaderName}</span>
                        )}
                        {conn.provider === "apikey_query" && conn.authQueryParam && (
                          <span className="text-xs text-[#656d76] font-mono truncate">Param: {conn.authQueryParam}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0">
                      {/* OAuth-specific actions */}
                      {isOAuth && (
                        <>
                          {/* Health check */}
                          {status?.authenticated && (
                            <button
                              onClick={() => void handleHealthCheck(conn)}
                              disabled={!!hcLoading}
                              className="p-1.5 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] rounded-md transition-colors disabled:opacity-50"
                              title="Health check"
                            >
                              {hcLoading ? (
                                <Spinner size="sm" className="text-[#656d76]" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
                                </svg>
                              )}
                            </button>
                          )}

                          {/* Refresh token */}
                          {status?.authenticated && status?.hasRefreshToken && (
                            <button
                              onClick={() => void handleRefresh(conn)}
                              disabled={refreshing === conn.id}
                              className="p-1.5 text-[#656d76] hover:text-[#1a7f37] hover:bg-[#dafbe1] rounded-md transition-colors disabled:opacity-50"
                              title="Refresh token now"
                            >
                              {refreshing === conn.id ? (
                                <Spinner size="sm" className="text-[#656d76]" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                                </svg>
                              )}
                            </button>
                          )}

                          {/* Connect / Disconnect */}
                          {status?.authenticated ? (
                            <button
                              onClick={() => void handleDisconnect(conn)}
                              disabled={disconnecting === conn.id}
                              className="px-2.5 py-1 text-sm font-medium text-[#656d76] bg-white border border-[#d1d9e0] rounded-md hover:bg-[#f6f8fa] hover:border-[#bbc0c5] transition-colors disabled:opacity-50"
                              title="Disconnect"
                            >
                              {disconnecting === conn.id ? "..." : "Disconnect"}
                            </button>
                          ) : (
                            <button
                              onClick={() => void handleConnect(conn)}
                              disabled={connecting === conn.id}
                              className="px-2.5 py-1 text-sm font-medium text-white bg-[#0969da] rounded-md hover:bg-[#0969da]/90 transition-colors disabled:opacity-50"
                              title="Connect via OAuth"
                            >
                              {connecting === conn.id ? "..." : "Connect"}
                            </button>
                          )}
                        </>
                      )}

                      {/* Edit — all types */}
                      <button
                        onClick={() => setEditing(conn)}
                        className="p-1.5 text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] rounded-md transition-colors"
                        title="Edit connection"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>

                      {/* Delete — all types */}
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

                  {/* Detail row — expiry, refresh, health check (OAuth only) */}
                  {renderConnectionDetail(conn)}
                </div>
              );
            })}
          </div>
        )}

        {/* Redirect URI help text — only if there are OAuth connections */}
        {connections.some((c) => c.provider === "oauth2") && (
          <div className="mt-4 p-3 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md">
            <p className="text-sm text-[#656d76]">
              <strong className="text-[#1f2328]">Redirect URI:</strong> When registering your OAuth app with the API provider,
              use{" "}
              <code className="bg-white px-1 rounded text-[#1f2328]">{window.location.origin}/callback</code>{" "}
              as the redirect URI. This is the same for all connections.
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
