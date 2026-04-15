// Client for Azure Static Web Apps built-in Entra ID (EasyAuth) endpoints.
// These endpoints are served by the SWA platform, not by our React code:
//   GET  /.auth/me              → { clientPrincipal: null | ClientPrincipal }
//   POST /.auth/logout          → clears the SWA session cookie, redirects
//   GET  /.auth/login/aad       → starts the Entra login flow

export interface EntraClientPrincipal {
  userId: string;           // Entra object ID (OID) — stable identifier
  userDetails: string;      // display name or UPN
  identityProvider: string; // "aad"
  userRoles: string[];      // always contains "authenticated" when signed in
  claims?: Array<{ typ: string; val: string }>;
}

interface AuthMeResponse {
  clientPrincipal: EntraClientPrincipal | null;
}

/**
 * Fetches the current Entra session from the SWA EasyAuth endpoint.
 * Returns:
 *   - { principal, available: true }  — endpoint works; principal may be null
 *   - { principal: null, available: false } — endpoint not reachable (local
 *     `vite dev` without SWA CLI) — caller should treat as "dev mode"
 */
export async function fetchEntraPrincipal(): Promise<{
  principal: EntraClientPrincipal | null;
  available: boolean;
}> {
  try {
    const res = await fetch("/.auth/me", { credentials: "include" });
    if (!res.ok) {
      // 404 → we're on a platform that doesn't expose EasyAuth. Treat as dev.
      return { principal: null, available: false };
    }
    const data = (await res.json()) as AuthMeResponse;
    return { principal: data.clientPrincipal, available: true };
  } catch {
    // Network error (local dev, misconfigured proxy) — treat as dev mode.
    return { principal: null, available: false };
  }
}

/**
 * Triggers SWA logout. Clears the session cookie and lands the user on the
 * in-app /logged-out page. We deliberately DON'T redirect to the app root
 * because the live Microsoft SSO cookie would silently re-authenticate the
 * user; /logged-out is exempt from EntraGate's auto-login.
 */
export function entraLogout(postLogoutUrl?: string): void {
  const target = postLogoutUrl ?? `${window.location.origin}/logged-out`;
  window.location.href = `/.auth/logout?post_logout_redirect_uri=${encodeURIComponent(target)}`;
}

/**
 * Starts the Entra login redirect. After success, SWA redirects the browser
 * back to `postLoginUrl` (defaults to current page).
 */
export function entraLogin(postLoginUrl?: string): void {
  const target = postLoginUrl ?? window.location.href;
  window.location.href = `/.auth/login/aad?post_login_redirect_uri=${encodeURIComponent(target)}`;
}
