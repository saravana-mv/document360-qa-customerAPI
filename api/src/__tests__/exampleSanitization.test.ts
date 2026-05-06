import {
  stripAuthHeaders,
  detectResidualSecrets,
  truncateForAi,
} from "../lib/exampleSanitization";

describe("stripAuthHeaders", () => {
  test("strips Authorization regardless of case", () => {
    const { sanitized, strippedValues } = stripAuthHeaders({
      "Authorization": "Bearer abc",
      "authorization": "Bearer xyz",
      "Content-Type": "application/json",
    });
    expect(sanitized).toEqual({ "Content-Type": "application/json" });
    expect(strippedValues).toEqual(expect.arrayContaining(["Bearer abc", "Bearer xyz"]));
  });

  test("strips cookie headers", () => {
    const { sanitized } = stripAuthHeaders({ Cookie: "session=abc", "Set-Cookie": "x=y" });
    expect(sanitized).toEqual({});
  });

  test("strips FlowForge internal headers", () => {
    const { sanitized } = stripAuthHeaders({
      "X-FF-Connection-Id": "conn-1",
      "X-FF-Base-Url": "https://api.example.com",
      "X-FlowForge-ProjectId": "proj-1",
      "X-MS-Client-Principal": "abc",
      "X-Custom": "keep",
    });
    expect(sanitized).toEqual({ "X-Custom": "keep" });
  });

  test("strips secret-suggesting header keys", () => {
    const { sanitized } = stripAuthHeaders({
      "X-API-Key": "secret",
      "X-Session-Token": "abc",
      "X-CSRF": "abc",
      "Accept": "application/json",
    });
    expect(sanitized).toEqual({ Accept: "application/json" });
  });

  test("preserves benign headers", () => {
    const { sanitized } = stripAuthHeaders({
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "FlowForge/1.0",
    });
    expect(sanitized).toEqual({
      "Accept": "application/json",
      "Content-Type": "application/json",
      "User-Agent": "FlowForge/1.0",
    });
  });

  test("handles undefined input gracefully", () => {
    const { sanitized, strippedValues } = stripAuthHeaders(undefined as unknown as Record<string, string>);
    expect(sanitized).toEqual({});
    expect(strippedValues).toEqual([]);
  });
});

describe("detectResidualSecrets", () => {
  test("flags JWT tokens", () => {
    const hits = detectResidualSecrets({ token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abc-xyz" }, []);
    expect(hits).toContain("jwt");
  });

  test("flags Bearer prefix in any string value", () => {
    const hits = detectResidualSecrets({ note: "Use Bearer abc-xyz to authenticate" }, []);
    expect(hits).toContain("bearer_prefix");
  });

  test("flags known secret values when present in output", () => {
    const hits = detectResidualSecrets(
      { config: { upstream: "https://api.example.com/?key=supersecret-12345" } },
      ["supersecret-12345"],
    );
    expect(hits).toContain("known_secret_value");
  });

  test("returns empty array when output is clean", () => {
    const hits = detectResidualSecrets({ id: "{{proj.articleId}}", title: "Hello" }, ["secret-value-here"]);
    expect(hits).toEqual([]);
  });

  test("does not flag short known secrets to avoid false positives", () => {
    const hits = detectResidualSecrets({ name: "abc" }, ["abc"]);
    expect(hits).not.toContain("known_secret_value");
  });

  test("walks nested arrays and objects", () => {
    const hits = detectResidualSecrets(
      { data: [{ inner: { token: "Bearer abc-xyz-12345" } }] },
      [],
    );
    expect(hits).toContain("bearer_prefix");
  });

  test("handles cycles without infinite recursion", () => {
    const a: Record<string, unknown> = { name: "x" };
    a.self = a;
    expect(() => detectResidualSecrets(a, [])).not.toThrow();
  });
});

describe("truncateForAi", () => {
  test("returns text unchanged when within limit", () => {
    const r = truncateForAi("hello", 100);
    expect(r.truncated).toBe(false);
    expect(r.text).toBe("hello");
    expect(r.originalSize).toBe(5);
  });

  test("truncates oversized text and appends marker", () => {
    const big = "a".repeat(200);
    const r = truncateForAi(big, 50);
    expect(r.truncated).toBe(true);
    expect(r.originalSize).toBe(200);
    expect(r.text.startsWith("a".repeat(50))).toBe(true);
    expect(r.text).toContain("(truncated, 200 bytes total)");
  });

  test("treats null as empty", () => {
    const r = truncateForAi(null, 50);
    expect(r.text).toBe("");
    expect(r.truncated).toBe(false);
    expect(r.originalSize).toBe(0);
  });
});
