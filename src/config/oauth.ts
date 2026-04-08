import type { OAuthConfig } from "../types/auth.types";

export const OAUTH_CONFIG: Omit<OAuthConfig, "redirectUri"> = {
  clientId: "apiHubWordClient",
  authorizationUrl: "https://identity.berlin.document360.net/connect/authorize",
  tokenUrl: "https://identity.berlin.document360.net/connect/token",
  scope: "openid profile email customerApi offline_access",
};

export function buildOAuthConfig(): OAuthConfig {
  return {
    ...OAUTH_CONFIG,
    redirectUri: `${window.location.origin}/callback`,
  };
}
