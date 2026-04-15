/**
 * Unit tests for the D360 token refresh helper.
 */

jest.mock("../lib/tokenStore", () => ({
  getTokenRow: jest.fn(),
  putTokenRow: jest.fn(),
  deleteTokenRow: jest.fn(),
}));

import { getValidAccessToken } from "../lib/d360Token";
import * as tokenStore from "../lib/tokenStore";

const OID = "aaaa-bbbb";

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).fetch = jest.fn();
});

describe("getValidAccessToken", () => {
  test("throws D360_NOT_AUTHENTICATED when no row exists", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue(null);
    await expect(getValidAccessToken(OID)).rejects.toThrow("D360_NOT_AUTHENTICATED");
  });

  test("returns stored token when not near expiry", async () => {
    const farFuture = Date.now() + 3_600_000;
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: OID,
      accessToken: "at-1",
      refreshToken: "rt-1",
      expiresAt: farFuture,
      createdAt: 1, updatedAt: 2,
    });
    const result = await getValidAccessToken(OID);
    expect(result.accessToken).toBe("at-1");
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(tokenStore.putTokenRow).not.toHaveBeenCalled();
  });

  test("refreshes when access token is expired", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: OID,
      accessToken: "at-old",
      refreshToken: "rt-old",
      expiresAt: Date.now() - 10_000,
      createdAt: 1, updatedAt: 2,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-new", refresh_token: "rt-new", expires_in: 3600 }),
    });

    const result = await getValidAccessToken(OID);

    expect(result.accessToken).toBe("at-new");
    expect(tokenStore.putTokenRow).toHaveBeenCalledWith(
      OID,
      expect.objectContaining({ accessToken: "at-new", refreshToken: "rt-new" }),
    );
  });

  test("keeps the old refresh token when the identity server omits one on refresh", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: OID,
      accessToken: "at-old",
      refreshToken: "rt-old",
      expiresAt: Date.now() - 10_000,
      createdAt: 1, updatedAt: 2,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "at-new", expires_in: 3600 }),
    });

    await getValidAccessToken(OID);

    expect(tokenStore.putTokenRow).toHaveBeenCalledWith(
      OID,
      expect.objectContaining({ refreshToken: "rt-old" }),
    );
  });

  test("throws D360_REFRESH_UNAVAILABLE when expired row has no refresh token", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: OID,
      accessToken: "at-old",
      expiresAt: Date.now() - 10_000,
      createdAt: 1, updatedAt: 2,
    });
    await expect(getValidAccessToken(OID)).rejects.toThrow("D360_REFRESH_UNAVAILABLE");
  });

  test("propagates refresh endpoint failures", async () => {
    (tokenStore.getTokenRow as jest.Mock).mockResolvedValue({
      oid: OID,
      accessToken: "at-old",
      refreshToken: "rt-old",
      expiresAt: Date.now() - 10_000,
      createdAt: 1, updatedAt: 2,
    });
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "invalid_grant",
    });
    await expect(getValidAccessToken(OID)).rejects.toThrow(/D360 refresh failed/);
  });
});
