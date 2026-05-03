// The HAR parser lives in the frontend (src/lib/harParser.ts) since it runs
// client-side only. We import it here via relative path for testing.
// Jest's ts-jest handles this fine; the tsc rootDir error is test-only.
/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore — file is outside api rootDir, but Jest resolves it correctly
import {
  parseHarFile,
  detectBaseUrls,
  filterApiCalls,
  sanitizeEntry,
  templateizePath,
  compactTrace,
  parseAndFilter,
} from "../../../src/lib/harParser";

// ── Helpers ──

interface EntryOverrides {
  method?: string;
  url?: string;
  status?: number;
  reqContentType?: string;
  resContentType?: string;
  reqHeaders?: Array<{ name: string; value: string }>;
  resHeaders?: Array<{ name: string; value: string }>;
  reqBody?: string;
  resBody?: string;
  time?: number;
}

function makeEntry(overrides: EntryOverrides) {
  return {
    request: {
      method: overrides.method ?? "GET",
      url: overrides.url ?? "https://api.example.com/v1/items",
      headers: overrides.reqHeaders ?? [],
      ...(overrides.reqBody
        ? { postData: { mimeType: overrides.reqContentType ?? "application/json", text: overrides.reqBody } }
        : {}),
    },
    response: {
      status: overrides.status ?? 200,
      headers: overrides.resHeaders ?? [],
      content: {
        mimeType: overrides.resContentType ?? "application/json",
        text: overrides.resBody ?? "{}",
      },
    },
    time: overrides.time ?? 50,
  };
}

function wrapHar(entries: ReturnType<typeof makeEntry>[]) {
  return JSON.stringify({ log: { version: "1.2", entries } });
}

// ── Tests ──

describe("parseHarFile", () => {
  it("parses valid HAR JSON", () => {
    const har = parseHarFile(wrapHar([makeEntry({})]));
    expect(har.log.entries).toHaveLength(1);
  });

  it("rejects invalid JSON", () => {
    expect(() => parseHarFile("not json")).toThrow();
  });

  it("rejects JSON without log.entries", () => {
    expect(() => parseHarFile(JSON.stringify({ foo: "bar" }))).toThrow("Invalid HAR file");
  });
});

describe("detectBaseUrls", () => {
  it("detects base URLs by frequency", () => {
    const entries = [
      makeEntry({ url: "https://api.example.com/v1/items" }),
      makeEntry({ url: "https://api.example.com/v1/users" }),
      makeEntry({ url: "https://cdn.example.com/style.css" }),
    ];
    const urls = detectBaseUrls(entries as any);
    expect(urls[0]).toBe("https://api.example.com");
    expect(urls).toContain("https://cdn.example.com");
  });
});

describe("filterApiCalls", () => {
  it("filters by base URL", () => {
    const entries = [
      makeEntry({ url: "https://api.example.com/v1/items" }),
      makeEntry({ url: "https://other.com/v1/items" }),
    ];
    const filtered = filterApiCalls(entries as any, "https://api.example.com");
    expect(filtered).toHaveLength(1);
  });

  it("excludes static assets", () => {
    const entries = [
      makeEntry({ url: "https://api.example.com/v1/items" }),
      makeEntry({ url: "https://api.example.com/bundle.js" }),
      makeEntry({ url: "https://api.example.com/logo.png" }),
      makeEntry({ url: "https://api.example.com/style.css" }),
    ];
    const filtered = filterApiCalls(entries as any, "https://api.example.com");
    expect(filtered).toHaveLength(1);
  });

  it("excludes analytics/tracking endpoints", () => {
    const entries = [
      makeEntry({ url: "https://api.example.com/v1/items" }),
      makeEntry({ url: "https://api.example.com/analytics/collect" }),
      makeEntry({ url: "https://api.example.com/telemetry/beacon" }),
    ];
    const filtered = filterApiCalls(entries as any, "https://api.example.com");
    expect(filtered).toHaveLength(1);
  });

  it("collapses duplicate GET polling requests", () => {
    const entries = [
      makeEntry({ url: "https://api.example.com/v1/items/123" }),
      makeEntry({ url: "https://api.example.com/v1/items/456" }),
      makeEntry({ url: "https://api.example.com/v1/items/789" }),
    ];
    const filtered = filterApiCalls(entries as any, "https://api.example.com");
    // All three have same template /v1/items/{id} with GET 200 — only first kept
    expect(filtered).toHaveLength(1);
  });

  it("keeps POST requests with same template", () => {
    const entries = [
      makeEntry({ method: "POST", url: "https://api.example.com/v1/items", reqBody: '{"name":"a"}' }),
      makeEntry({ method: "POST", url: "https://api.example.com/v1/items", reqBody: '{"name":"b"}' }),
    ];
    const filtered = filterApiCalls(entries as any, "https://api.example.com");
    expect(filtered).toHaveLength(2);
  });
});

describe("sanitizeEntry", () => {
  it("strips Authorization header", () => {
    const entry = makeEntry({
      reqHeaders: [
        { name: "Authorization", value: "Bearer secret123" },
        { name: "Content-Type", value: "application/json" },
      ],
    });
    const sanitized = sanitizeEntry(entry as any);
    const headerNames = sanitized.request.headers.map((h) => h.name);
    expect(headerNames).not.toContain("Authorization");
    expect(headerNames).toContain("Content-Type");
  });

  it("strips Cookie and Set-Cookie headers", () => {
    const entry = makeEntry({
      reqHeaders: [{ name: "Cookie", value: "session=abc" }],
      resHeaders: [{ name: "Set-Cookie", value: "session=abc" }],
    });
    const sanitized = sanitizeEntry(entry as any);
    expect(sanitized.request.headers).toHaveLength(0);
    expect(sanitized.response.headers).toHaveLength(0);
  });

  it("strips x-api-key header", () => {
    const entry = makeEntry({
      reqHeaders: [{ name: "x-api-key", value: "my-secret-key" }],
    });
    const sanitized = sanitizeEntry(entry as any);
    expect(sanitized.request.headers).toHaveLength(0);
  });

  it("strips headers containing token/secret/auth", () => {
    const entry = makeEntry({
      reqHeaders: [
        { name: "x-auth-token", value: "abc" },
        { name: "x-secret-key", value: "def" },
        { name: "Accept", value: "application/json" },
      ],
    });
    const sanitized = sanitizeEntry(entry as any);
    expect(sanitized.request.headers).toHaveLength(1);
    expect(sanitized.request.headers[0].name).toBe("Accept");
  });

  it("redacts sensitive body fields", () => {
    const entry = makeEntry({
      method: "POST",
      reqBody: JSON.stringify({ username: "user", password: "secret123", token: "abc" }),
    });
    const sanitized = sanitizeEntry(entry as any);
    const body = JSON.parse(sanitized.request.postData!.text!);
    expect(body.username).toBe("user");
    expect(body.password).toBe("[REDACTED]");
    expect(body.token).toBe("[REDACTED]");
  });

  it("redacts nested sensitive fields", () => {
    const entry = makeEntry({
      resBody: JSON.stringify({ data: { accessToken: "xyz", name: "test" } }),
    });
    const sanitized = sanitizeEntry(entry as any);
    const body = JSON.parse(sanitized.response.content!.text!);
    expect(body.data.accessToken).toBe("[REDACTED]");
    expect(body.data.name).toBe("test");
  });
});

describe("templateizePath", () => {
  it("replaces UUIDs with {id}", () => {
    expect(templateizePath("/v1/items/550e8400-e29b-41d4-a716-446655440000")).toBe("/v1/items/{id}");
  });

  it("replaces MongoDB ObjectIDs with {id}", () => {
    expect(templateizePath("/v1/items/507f1f77bcf86cd799439011")).toBe("/v1/items/{id}");
  });

  it("replaces numeric segments with {id}", () => {
    expect(templateizePath("/v1/items/12345")).toBe("/v1/items/{id}");
  });

  it("leaves non-ID segments untouched", () => {
    expect(templateizePath("/v1/items/bulk")).toBe("/v1/items/bulk");
  });

  it("handles multiple ID segments", () => {
    expect(templateizePath("/v1/categories/123/articles/456")).toBe("/v1/categories/{id}/articles/{id}");
  });
});

describe("compactTrace", () => {
  it("formats calls as numbered lines", () => {
    const calls = [
      { seq: 1, method: "POST", path: "/v1/items", pathTemplate: "/v1/items", status: 201, timingMs: 45, requestBodyKeys: ["name", "description"], responseBodyKeys: ["id", "name"] },
      { seq: 2, method: "GET", path: "/v1/items/123", pathTemplate: "/v1/items/{id}", status: 200, timingMs: 12, requestBodyKeys: [], responseBodyKeys: ["id", "name", "description"] },
    ];
    const trace = compactTrace(calls);
    expect(trace).toContain("[1] POST /v1/items");
    expect(trace).toContain("201");
    expect(trace).toContain("Body: name, description");
    expect(trace).toContain("[2] GET /v1/items/{id}");
  });

  it("stays within character limit", () => {
    const calls = Array.from({ length: 500 }, (_, i) => ({
      seq: i + 1,
      method: "GET",
      path: `/v1/items/${i}`,
      pathTemplate: "/v1/items/{id}",
      status: 200,
      timingMs: 10,
      requestBodyKeys: [] as string[],
      responseBodyKeys: ["id", "name", "description", "created_at"],
    }));
    const trace = compactTrace(calls, 1000);
    expect(trace.length).toBeLessThanOrEqual(1000);
    expect(trace).toContain("truncated");
  });
});

describe("parseAndFilter (end-to-end)", () => {
  it("parses, filters, sanitizes, and produces a trace", () => {
    const raw = wrapHar([
      makeEntry({
        method: "POST",
        url: "https://api.example.com/v2/categories",
        status: 201,
        reqBody: JSON.stringify({ name: "Test", description: "A category", password: "secret" }),
        resBody: JSON.stringify({ id: "cat-1", name: "Test", slug: "test" }),
        reqHeaders: [{ name: "Authorization", value: "Bearer tok123" }],
        time: 45,
      }),
      makeEntry({
        url: "https://api.example.com/v2/categories/cat-1",
        status: 200,
        resBody: JSON.stringify({ id: "cat-1", name: "Test", articles_count: 0 }),
        time: 12,
      }),
      makeEntry({ url: "https://cdn.example.com/logo.png", status: 200, resContentType: "image/png" }),
    ]);

    const result = parseAndFilter(raw);

    expect(result.totalEntries).toBe(3);
    expect(result.filteredEntries).toBe(2);
    expect(result.baseUrlUsed).toBe("https://api.example.com");
    expect(result.apiCalls[0].method).toBe("POST");
    expect(result.apiCalls[0].requestBodyKeys).toContain("name");
    expect(result.trace).toContain("[1] POST /v2/categories");
    expect(result.trace).toContain("[2] GET /v2/categories/cat-1");
    // Sensitive data should be sanitized
    expect(result.trace).not.toContain("Bearer tok123");
  });

  it("uses explicit base URL filter", () => {
    const raw = wrapHar([
      makeEntry({ url: "https://api.example.com/v1/items" }),
      makeEntry({ url: "https://other.com/v1/items" }),
    ]);
    const result = parseAndFilter(raw, "https://other.com");
    expect(result.filteredEntries).toBe(1);
    expect(result.baseUrlUsed).toBe("https://other.com");
  });
});
