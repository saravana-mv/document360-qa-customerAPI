import { create } from "zustand";
import {
  listConnections,
  createConnection,
  updateConnection,
  deleteConnection,
  type Connection,
  type CreateConnectionPayload,
  type UpdateConnectionPayload,
} from "../lib/api/connectionsApi";
import {
  getOAuthStatus,
  logoutOAuth,
  refreshOAuth,
  healthCheckOAuth,
  type OAuthStatus,
  type HealthCheckResult,
} from "../lib/api/oauthApi";

interface ConnectionsState {
  connections: Connection[];
  /** Per-connection OAuth status: connectionId → status */
  authStatus: Record<string, OAuthStatus>;
  /** Per-connection health check result */
  healthChecks: Record<string, HealthCheckResult & { loading?: boolean }>;
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  add: (payload: CreateConnectionPayload) => Promise<Connection>;
  update: (id: string, payload: UpdateConnectionPayload) => Promise<Connection>;
  remove: (id: string) => Promise<void>;
  /** Fetch OAuth token status for a single connection */
  fetchStatus: (connectionId: string) => Promise<OAuthStatus>;
  /** Fetch OAuth token status for all connections */
  fetchAllStatuses: () => Promise<void>;
  /** Disconnect (logout) a connection's OAuth tokens */
  disconnect: (connectionId: string) => Promise<void>;
  /** Force-refresh a connection's OAuth token */
  refreshToken: (connectionId: string) => Promise<void>;
  /** Run a health check on a connection */
  runHealthCheck: (connectionId: string) => Promise<HealthCheckResult>;
  reset: () => void;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  authStatus: {},
  healthChecks: {},
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const connections = await listConnections();
      set({ connections, loading: false });
      // Fetch statuses for all connections in background
      void get().fetchAllStatuses();
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  add: async (payload) => {
    const conn = await createConnection(payload);
    set((s) => ({ connections: [...s.connections, conn] }));
    return conn;
  },

  update: async (id, payload) => {
    const conn = await updateConnection(id, payload);
    set((s) => ({
      connections: s.connections.map((c) => (c.id === id ? conn : c)),
    }));
    return conn;
  },

  remove: async (id) => {
    await deleteConnection(id);
    set((s) => ({
      connections: s.connections.filter((c) => c.id !== id),
      authStatus: { ...s.authStatus, [id]: { authenticated: false } },
    }));
  },

  fetchStatus: async (connectionId) => {
    const status = await getOAuthStatus(connectionId);
    set((s) => ({
      authStatus: { ...s.authStatus, [connectionId]: status },
    }));
    return status;
  },

  fetchAllStatuses: async () => {
    const { connections } = get();
    // Only poll OAuth connections — token-based connections don't have token status
    const oauthConns = connections.filter((c) => c.provider === "oauth2");
    if (oauthConns.length === 0) return;
    const results = await Promise.allSettled(
      oauthConns.map((c) => getOAuthStatus(c.id).then((s) => ({ id: c.id, status: s }))),
    );
    const statuses: Record<string, OAuthStatus> = {};
    for (const r of results) {
      if (r.status === "fulfilled") {
        statuses[r.value.id] = r.value.status;
      }
    }
    set((s) => ({ authStatus: { ...s.authStatus, ...statuses } }));
  },

  disconnect: async (connectionId) => {
    await logoutOAuth(connectionId);
    set((s) => ({
      authStatus: { ...s.authStatus, [connectionId]: { authenticated: false } },
    }));
  },

  refreshToken: async (connectionId) => {
    try {
      const result = await refreshOAuth(connectionId);
      // After refresh, update the status with new expiry
      set((s) => ({
        authStatus: {
          ...s.authStatus,
          [connectionId]: {
            ...s.authStatus[connectionId],
            authenticated: true,
            expired: false,
            expiresAt: result.expiresAt,
            expiresInMs: result.expiresAt - Date.now(),
            lastRefreshedAt: Date.now(),
          },
        },
      }));
    } catch (e) {
      // If refresh token is expired/revoked, clear status so UI shows "Not connected"
      const { OAuthRefreshExpiredError } = await import("../lib/api/oauthApi");
      if (e instanceof OAuthRefreshExpiredError) {
        set((s) => ({
          authStatus: {
            ...s.authStatus,
            [connectionId]: { authenticated: false },
          },
        }));
      }
      throw e;
    }
  },

  runHealthCheck: async (connectionId) => {
    set((s) => ({
      healthChecks: { ...s.healthChecks, [connectionId]: { ...s.healthChecks[connectionId], healthy: false, loading: true } },
    }));
    try {
      const result = await healthCheckOAuth(connectionId);
      set((s) => ({
        healthChecks: { ...s.healthChecks, [connectionId]: { ...result, loading: false } },
      }));
      // Also refresh status if health check updated tokens
      if (result.healthy && result.expiresAt) {
        set((s) => ({
          authStatus: {
            ...s.authStatus,
            [connectionId]: {
              ...s.authStatus[connectionId],
              authenticated: true,
              expired: false,
              expiresAt: result.expiresAt,
              expiresInMs: result.expiresInMs,
              lastRefreshedAt: result.lastRefreshedAt,
            },
          },
        }));
      }
      return result;
    } catch (e) {
      const failResult: HealthCheckResult = { healthy: false, reason: e instanceof Error ? e.message : String(e) };
      set((s) => ({
        healthChecks: { ...s.healthChecks, [connectionId]: { ...failResult, loading: false } },
      }));
      return failResult;
    }
  },

  reset: () => set({ connections: [], authStatus: {}, healthChecks: {}, loading: false, error: null }),
}));
