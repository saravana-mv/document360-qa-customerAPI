const KEYS = {
  CODE_VERIFIER: "oauth_code_verifier",
  STATE: "oauth_state",
  TOKEN: "oauth_token",
} as const;

export function saveVerifier(verifier: string, state: string): void {
  sessionStorage.setItem(KEYS.CODE_VERIFIER, verifier);
  sessionStorage.setItem(KEYS.STATE, state);
}

export function getVerifier(): string | null {
  return sessionStorage.getItem(KEYS.CODE_VERIFIER);
}

export function getState(): string | null {
  return sessionStorage.getItem(KEYS.STATE);
}

export function clearPkce(): void {
  sessionStorage.removeItem(KEYS.CODE_VERIFIER);
  sessionStorage.removeItem(KEYS.STATE);
}

export function saveToken(token: unknown): void {
  sessionStorage.setItem(KEYS.TOKEN, JSON.stringify(token));
}

export function getToken(): unknown | null {
  const raw = sessionStorage.getItem(KEYS.TOKEN);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearToken(): void {
  sessionStorage.removeItem(KEYS.TOKEN);
}
