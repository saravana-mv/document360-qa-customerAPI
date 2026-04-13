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

/** Read sessionStorage synchronously — safe to call at module load time. */
function resolveInitialAuth(): { status: AuthStatus; token: TokenSet | null } {
  const token = getToken() as TokenSet | null;
  if (token) {
    const isExpired = token.expires_at && token.expires_at < Date.now();
    if (!isExpired) {
      return { status: "authenticated", token };
    }
  }
  return { status: "unauthenticated", token: null };
}

const initial = resolveInitialAuth();

export const useAuthStore = create<AuthState>((set) => ({
  // Auth resolved synchronously at store creation — no loading flash
  status: initial.status,
  token: initial.token,
  config: null,
  error: null,

  setConfig: (config) => set({ config }),
  setToken: (token) => set({ token, status: "authenticated" }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: "error" }),

  logout: () => {
    sessionStorage.clear();
    set({ status: "unauthenticated", token: null, error: null });
  },

  // Kept for compatibility — re-checks session if called explicitly
  initFromSession: () => {
    const { status, token } = resolveInitialAuth();
    set({ status, token });
  },
}));

/** Returns true when a non-expired token is present. */
export function isSessionValid(): boolean {
  const { token, status } = useAuthStore.getState();
  if (status !== "authenticated" || !token) return false;
  if (token.expires_at && token.expires_at < Date.now()) return false;
  return true;
}
