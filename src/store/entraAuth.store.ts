// Zustand store for the outer Entra ID (corporate SSO) session.
// Separate from auth.store.ts (which tracks the per-project Document360 OAuth
// session). Entra login gates access to the app itself; D360 OAuth gates
// access to a specific Document360 project inside the app.

import { create } from "zustand";
import { fetchEntraPrincipal, entraLogout, entraLogin } from "../lib/entraAuth/client";
import type { EntraClientPrincipal } from "../lib/entraAuth/client";

export type EntraStatus =
  | "checking"         // initial — /.auth/me request in flight
  | "authenticated"    // valid Entra session
  | "unauthenticated"  // EasyAuth reachable but no session — must log in
  | "dev-mode";        // EasyAuth not reachable (local vite dev) — allow through

interface EntraState {
  status: EntraStatus;
  principal: EntraClientPrincipal | null;
  check: () => Promise<void>;
  login: () => void;
  logout: () => void;
}

export const useEntraAuthStore = create<EntraState>((set) => ({
  status: "checking",
  principal: null,

  check: async () => {
    const { principal, available } = await fetchEntraPrincipal();
    if (!available) {
      set({ status: "dev-mode", principal: null });
      return;
    }
    if (principal) {
      set({ status: "authenticated", principal });
    } else {
      set({ status: "unauthenticated", principal: null });
    }
  },

  login: () => entraLogin(),

  logout: () => {
    // Clear any client-side data that could leak between users on a shared
    // machine. Phase-2 work will move D360 tokens and caches server-side.
    try { localStorage.clear(); } catch { /* quota / private-mode errors ignored */ }
    try { sessionStorage.clear(); } catch { /* same */ }
    entraLogout();
  },
}));
