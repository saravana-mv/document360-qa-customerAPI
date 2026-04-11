import { create } from "zustand";
import type { OAuthConfig, TokenSet, AuthStatus } from "../types/auth.types";
import { getToken } from "../lib/oauth/session";

interface AuthState {
  status: AuthStatus;
  config: OAuthConfig | null;
  token: TokenSet | null;
  error: string | null;
  setConfig: (config: OAuthConfig) => void;
  setToken: (token: TokenSet) => void;
  setStatus: (status: AuthStatus) => void;
  setError: (error: string) => void;
  logout: () => void;
  initFromSession: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: "loading",
  config: null,
  token: null,
  error: null,

  setConfig: (config) => set({ config }),
  setToken: (token) => set({ token, status: "authenticated" }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: "error" }),

  logout: () => {
    sessionStorage.clear();
    set({ status: "unauthenticated", token: null, error: null });
  },

  initFromSession: () => {
    const token = getToken() as TokenSet | null;
    if (token) {
      const isExpired = token.expires_at && token.expires_at < Date.now();
      if (!isExpired) {
        set({ token, status: "authenticated" });
        return;
      }
    }
    set({ status: "unauthenticated" });
  },
}));
