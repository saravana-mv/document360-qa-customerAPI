export interface OAuthConfig {
  clientId: string;
  authorizationUrl: string;
  tokenUrl: string;
  scope: string;
  redirectUri: string;
}

export interface TokenSet {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  expires_at?: number;
}

export type AuthStatus = "loading" | "unauthenticated" | "authenticating" | "authenticated" | "error";
