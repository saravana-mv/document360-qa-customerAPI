/**
 * Unit tests for the D360 auth handlers (exchange / status / logout).
 */

jest.mock("../lib/tokenStore", () => ({
  getTokenRow: jest.fn(),
  putTokenRow: jest.fn(),
  deleteTokenRow: jest.fn(),
}));

import { exchangeHandler, statusHandler, logoutHandler } from "../functions/d360Auth";
import * as tokenStore from "../lib/tokenStore";

const ENTRA_OID = "11111111-2222-3333-4444-555555555555";

function fakeJwtWithProject(projectId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ doc360_project_id: projectId })).toString("base64url");
  return `${header}.${payload}.sig`;
}

function makeReq(opts: { method?: string; principal?: boolean; body?: unknown }) {
  const principalObj = {
    userId: ENTRA_OID,
    userDetails: "alice@example.com",
    identityProvider: "aad",
    userRoles: ["authenticated"],
  };
  const headers = new Map<string, string>();
  if (opts.principal !== false) {
    headers.set(
      "x-ms-client-principal",
      Buffer.from(JSON.stringify(principalObj)).toString("base64"),
    );
  }
  return {
    method: opts.method ?? "POST",
    headers: { get: (k: string) => headers.get(k.toLowerCase()) ?? null },
    json: jest.fn().mockResolvedValue(opts.body ?? {}),
  } as any;
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).fetch = jest.fn();
});

describe("exchangeHandler", () => {
  test("returns 401 when no principal", async () => {
    const res = await exchangeHandler(makeReq({ principal: false }));
    expect(res.status).toBe(401);
  });

  test("returns 400 when required fields are missing", async () => {
    const res = await exchangeHandler(makeReq({ body: { code: "abc" } }));
    expect(res.status).toBe(400);
  });

  test("exchanges code and persists token row on success", async () => {
    const access = fakeJwtWithProject("proj-xyz");
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: access, refresh_token: "rt-1", expires_in: 3600 }),
    });

    const req = makeReq({
      body: { code: "c", codeVerifier: "v", redirectUri: "https://app/callback" },
    });
    const res = await exchangeHandler(req);

    expect(res.status).toBe(200);
    expect(tokenStore.putTokenRow).toHaveBeenCalledWith(
      ENTRA_OID,
      expect.objectContaining({
        accessToken: access,
        refreshToken: "rt-1",
        projectId: "proj-xyz",
      }),
    );
    const body = JSON.parse(res.body as string);
    expect(body.authenticated).toBe(true);
    expect(body.projectId).toBe("proj-xyz");
  });

  test("returns 500 when D360 token endpoint fails", async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });

    const res = await exchangeHandler(
      makeReq({ body: { code: "c", codeVerifier: "v", redirectUri: "https://app/callback" } }),
    );

    expect(res.status).toBe(500);
    expect(tokenStore.putTokenRow).not.toHaveBeenCalled();
  });
});

describe("statusHandler", () => {
  test("returns authenticated:false when no row", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue(null);
    const res = await statusHandler(makeReq({ method: "GET" }));
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body as string)).toEqual({ authenticated: false });
  });

  test("returns authenticated:true with metadata when row exists", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: ENTRA_OID,
      accessToken: "at",
      refreshToken: "rt",
      projectId: "proj-xyz",
      expiresAt: 1_700_000_000_000,
      createdAt: 1,
      updatedAt: 2,
    });
    const res = await statusHandler(makeReq({ method: "GET" }));
    const body = JSON.parse(res.body as string);
    expect(body.authenticated).toBe(true);
    expect(body.projectId).toBe("proj-xyz");
    expect(body.expiresAt).toBe(1_700_000_000_000);
    expect(body.hasRefreshToken).toBe(true);
  });
});

describe("logoutHandler", () => {
  test("calls deleteTokenRow with the caller's oid", async () => {
    (tokenStore.deleteTokenRow as jest.Mock).mockResolvedValue(undefined);
    const res = await logoutHandler(makeReq({}));
    expect(res.status).toBe(200);
    expect(tokenStore.deleteTokenRow).toHaveBeenCalledWith(ENTRA_OID);
  });
});
