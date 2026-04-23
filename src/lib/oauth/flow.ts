import { generateCodeVerifier, generateCodeChallenge, generateState } from "./pkce";
import {
  saveVerifier, getVerifier, getState, clearPkce,
} from "./session";

// ── Generic connection-based OAuth flow ──────────────────────────────────────

const CONNECTION_ID_KEY = "oauth_connection_id";

/** Save the connection ID so the callback handler knows which connection to exchange for. */
export function saveConnectionId(connectionId: string): void {
  sessionStorage.setItem(CONNECTION_ID_KEY, connectionId);
}

export function loadConnectionId(): string | null {
  return sessionStorage.getItem(CONNECTION_ID_KEY);
}

export function clearConnectionId(): void {
  sessionStorage.removeItem(CONNECTION_ID_KEY);
}

/**
 * Start an OAuth flow for a generic connection.
 * The connection config (authorizationUrl, clientId, scopes) is passed in from the store.
 */
export async function startConnectionAuthFlow(connection: {
  id: string;
  authorizationUrl: string;
  clientId: string;
  scopes: string;
  redirectUri: string;
}): Promise<void> {
  const verifier = await generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const state = generateState();

  saveVerifier(verifier, state);
  saveConnectionId(connection.id);

  const redirectUri = `${window.location.origin}${connection.redirectUri}`;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: connection.clientId,
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  if (connection.scopes) {
    params.set("scope", connection.scopes);
  }

  window.location.href = `${connection.authorizationUrl}?${params.toString()}`;
}

/**
 * Handle the OAuth callback for a generic connection.
 * Exchanges the authorization code server-side and returns the result.
 */
export async function handleConnectionCallback(
  code: string,
  returnedState: string,
  connectionId: string,
  redirectUri: string,
): Promise<{ authenticated: boolean; expiresAt: number }> {
  const expectedState = getState();
  if (!expectedState || returnedState !== expectedState) {
    throw new Error("OAuth state mismatch — possible CSRF attack");
  }

  const verifier = getVerifier();
  if (!verifier) {
    throw new Error("Missing PKCE code verifier");
  }

  clearPkce();
  clearConnectionId();

  const { exchangeOAuthCode } = await import("../api/oauthApi");
  return exchangeOAuthCode({
    connectionId,
    code,
    codeVerifier: verifier,
    redirectUri,
  });
}
