import { create } from "zustand";
import type { OAuthConfig, TokenSet, AuthStatus } from "../types/auth.types";
import { getToken, getProjectId, saveProjectId, clearToken } from "../lib/oauth/session";
import { logoutServer } from "../lib/oauth/flow";

interface AuthState {
  status: AuthStatus;
  config: OAuthConfig | null;
  token: TokenSet | null;
  /** Document360 project UUID, resolved server-side during exchange. */
  projectId: string;
  error: string | null;
  setConfig: (config: OAuthConfig) => void;
  setToken: (token: TokenSet, projectId?: string) => void;
  setStatus: (status: AuthStatus) => void;
  setError: (error: string) => void;
  logout: () => void;
  initFromSession: () => void;
}

/** Read sessionStorage synchronously — safe to call at module load time. */
function resolveInitialAuth(): { status: AuthStatus; token: TokenSet | null; projectId: string } {
  const token = getToken() as TokenSet | null;
  if (token) {
    const isExpired = token.expires_at && token.expires_at < Date.now();
    if (!isExpired) {
      return { status: "authenticated", token, projectId: getProjectId() };
    }
  }
  return { status: "unauthenticated", token: null, projectId: "" };
}

const initial = resolveInitialAuth();

export const useAuthStore = create<AuthState>((set) => ({
  // Auth resolved synchronously at store creation — no loading flash
  status: initial.status,
  token: initial.token,
  projectId: initial.projectId,
  config: null,
  error: null,

  setConfig: (config) => set({ config }),
  setToken: (token, projectId) => {
    if (projectId !== undefined) saveProjectId(projectId);
    set({ token, status: "authenticated", ...(projectId !== undefined ? { projectId } : {}) });
  },
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: "error" }),

  logout: () => {
    void logoutServer();
    clearToken();
    set({ status: "unauthenticated", token: null, projectId: "", error: null });
  },

  // Kept for compatibility — re-checks session if called explicitly
  initFromSession: () => {
    const { status, token, projectId } = resolveInitialAuth();
    set({ status, token, projectId });
  },
}));

/** Returns true when a non-expired token is present. */
export function isSessionValid(): boolean {
  const { token, status } = useAuthStore.getState();
  if (status !== "authenticated" || !token) return false;
  if (token.expires_at && token.expires_at < Date.now()) return false;
  return true;
}
