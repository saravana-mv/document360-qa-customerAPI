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

interface ConnectionsState {
  connections: Connection[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  add: (payload: CreateConnectionPayload) => Promise<Connection>;
  update: (id: string, payload: UpdateConnectionPayload) => Promise<Connection>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

export const useConnectionsStore = create<ConnectionsState>((set, get) => ({
  connections: [],
  loading: false,
  error: null,

  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const connections = await listConnections();
      set({ connections, loading: false });
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
    }));
  },

  reset: () => set({ connections: [], loading: false, error: null }),
}));
