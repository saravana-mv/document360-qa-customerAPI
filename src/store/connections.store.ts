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
import { getOAuthStatus, logoutOAuth, type OAuthStatus } from "../lib/api/oauthApi";

interface ConnectionsState {
  connections: Connection[];
  /** Per-connection OAuth status: connectionId → status */
  authStatus: Record<string, OAuthStatus>;
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
  reset: () => void;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  authStatus: {},
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
    const results = await Promise.allSettled(
      connections.map((c) => getOAuthStatus(c.id).then((s) => ({ id: c.id, status: s }))),
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

  reset: () => set({ connections: [], authStatus: {}, loading: false, error: null }),
}));
