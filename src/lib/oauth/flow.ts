import type { OAuthConfig, TokenSet } from "../../types/auth.types";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce";
import {
  saveVerifier, getVerifier, getState, clearPkce, saveToken, saveProjectId, clearToken,
} from "./session";

// Phase 2: the browser no longer sees the real D360 access token. The
// authorization-code + PKCE redirect is still driven from the SPA so the user
// sees D360's consent UI, but the code→token exchange happens in an Azure
// Function which stores the token server-side. The SPA keeps a synthetic
// TokenSet (access_token = "proxied") so existing call sites continue to
// compile, and /api/d360/proxy injects the real Bearer header on each request.

const PROXIED_TOKEN = "proxied";

export async function startAuthFlow(config: OAuthConfig): Promise<void> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  saveVerifier(verifier, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scope,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    acr_values: "project_select",
  });

  window.location.href = `${config.authorizationUrl}?${params.toString()}`;
}

interface ExchangeResponse {
  authenticated: boolean;
  projectId: string;
  expiresAt: number;
}

export interface CallbackResult {
  token: TokenSet;
  projectId: string;
}

export async function handleCallback(
  code: string,
  returnedState: string,
  config: OAuthConfig
): Promise<CallbackResult> {
  const expectedState = getState();
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  const verifier = getVerifier();
  if (!verifier) {
    throw new Error("Missing PKCE code verifier");
  }

  clearPkce();

  const res = await fetch("/api/d360/auth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier: verifier,
      redirectUri: config.redirectUri,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as ExchangeResponse;

  const token: TokenSet = {
    access_token: PROXIED_TOKEN,
    token_type: "Bearer",
    expires_at: data.expiresAt,
  };
  saveToken(token);
  saveProjectId(data.projectId);
  return { token, projectId: data.projectId };
}

/** Returns the current D360 auth status as reported by the backend. */
export async function fetchAuthStatus(): Promise<
  { authenticated: false } | { authenticated: true; projectId: string; expiresAt: number }
> {
  const res = await fetch("/api/d360/auth/status");
  if (!res.ok) return { authenticated: false };
  return (await res.json()) as
    | { authenticated: false }
    | { authenticated: true; projectId: string; expiresAt: number };
}

/** Clears the stored D360 token row on the server. */
export async function logoutServer(): Promise<void> {
  try {
    await fetch("/api/d360/auth/logout", { method: "POST" });
  } catch {
    // best-effort
  }
  clearToken();
}

const CONFIG_KEY = "oauth_config";

export function saveOAuthConfig(config: OAuthConfig): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadOAuthConfig(): OAuthConfig | null {
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
