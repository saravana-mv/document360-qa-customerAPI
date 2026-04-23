import { create } from "zustand";
import type { OAuthConfig, TokenSet, AuthStatus } from "../types/auth.types";
import { clearToken } from "../lib/oauth/session";

interface AuthState {
  status: AuthStatus;
  config: OAuthConfig | null;
  token: TokenSet | null;
  error: string | null;
  setConfig: (config: OAuthConfig) => void;
  setToken: (token: TokenSet, projectId?: string) => void;
  setStatus: (status: AuthStatus) => void;
  setError: (error: string) => void;
  logout: () => void;
  initFromSession: () => void;
}

// Auto-authenticated: Entra ID gates app access, no separate login needed.
const PROXY_TOKEN: TokenSet = { access_token: "proxied", token_type: "Bearer" };

export const useAuthStore = create<AuthState>((set) => ({
  status: "authenticated",
  token: PROXY_TOKEN,
  config: null,
  error: null,

  setConfig: (config) => set({ config }),
  setToken: (token, _projectId) => {
    set({ token, status: "authenticated" });
  },
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: "error" }),

  logout: () => {
    clearToken();
    set({ status: "unauthenticated", token: null, error: null });
  },

  // Auto-authenticated after Entra login
  initFromSession: () => {
    set({ status: "authenticated", token: PROXY_TOKEN });
  },
}));

/** Returns true when authenticated (always true after Entra login). */
export function isSessionValid(): boolean {
  const { status } = useAuthStore.getState();
  return status === "authenticated";
}
