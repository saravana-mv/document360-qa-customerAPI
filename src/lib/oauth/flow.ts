import type { OAuthConfig, TokenSet } from "../../types/auth.types";
import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce";
import { saveVerifier, getVerifier, getState, clearPkce, saveToken } from "./session";

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
  });

  window.location.href = `${config.authorizationUrl}?${params.toString()}`;
}

export async function handleCallback(
  code: string,
  returnedState: string,
  config: OAuthConfig
): Promise<TokenSet> {
  const expectedState = getState();
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  const verifier = getVerifier();
  if (!verifier) {
    throw new Error("Missing PKCE code verifier");
  }

  clearPkce();

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: verifier,
  });

  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Token exchange failed: ${response.status} ${text}`);
  }

  const token: TokenSet = await response.json();
  token.expires_at = token.expires_in ? Date.now() + token.expires_in * 1000 : undefined;
  saveToken(token);
  return token;
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
