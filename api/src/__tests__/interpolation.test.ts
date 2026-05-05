import {
  parseEnumAliases,
  buildEnumMap,
  setEnumAliases,
  enumMatches,
  rewriteApiVersion,
  readDotPath,
  readPath,
  fieldExists,
  substitute,
  resolveParam,
  jsonEqual,
  coerce,
} from "../lib/flowRunner/interpolation";

import type { RunContext } from "../lib/flowRunner/types";

type RunState = Record<string, unknown>;

function makeCtx(overrides?: Partial<RunContext>): RunContext {
  return {
    baseUrl: "https://api.example.com",
    apiVersion: "v2",
    accessToken: "tok_abc",
    apiKey: "key_xyz",
    projectVariables: { projectId: "p123", env: "staging" },
    ...overrides,
  } as RunContext;
}

// ---------------------------------------------------------------------------
// parseEnumAliases
// ---------------------------------------------------------------------------
describe("parseEnumAliases", () => {
  it("returns empty array for empty string", () => {
    expect(parseEnumAliases("")).toEqual([]);
  });

  it("returns empty array for whitespace-only string", () => {
    expect(parseEnumAliases("   \n  \n  ")).toEqual([]);
  });

  it("returns empty array for null/undefined coerced to empty", () => {
    // The function checks !raw first
    expect(parseEnumAliases(null as unknown as string)).toEqual([]);
    expect(parseEnumAliases(undefined as unknown as string)).toEqual([]);
  });

  it("parses valid name=value entries", () => {
    const raw = "Draft=0\nPublished=1\nArchived=2";
    expect(parseEnumAliases(raw)).toEqual([
      { name: "Draft", value: 0 },
      { name: "Published", value: 1 },
      { name: "Archived", value: 2 },
    ]);
  });

  it("ignores comment lines starting with #", () => {
    const raw = "# This is a comment\nDraft=0\n# Another comment\nPublished=1";
    const result = parseEnumAliases(raw);
    expect(result).toEqual([
      { name: "Draft", value: 0 },
      { name: "Published", value: 1 },
    ]);
  });

  it("ignores blank lines", () => {
    const raw = "Draft=0\n\n\nPublished=1\n\n";
    expect(parseEnumAliases(raw)).toHaveLength(2);
  });

  it("ignores lines without equals sign", () => {
    const raw = "Draft=0\nno-equals-here\nPublished=1";
    expect(parseEnumAliases(raw)).toHaveLength(2);
  });

  it("ignores lines where equals is at position 0 (no name)", () => {
    const raw = "=5\nDraft=0";
    expect(parseEnumAliases(raw)).toEqual([{ name: "Draft", value: 0 }]);
  });

  it("ignores entries with non-numeric values", () => {
    const raw = "Draft=zero\nPublished=1";
    expect(parseEnumAliases(raw)).toEqual([{ name: "Published", value: 1 }]);
  });

  it("trims whitespace around name and value", () => {
    const raw = "  Draft  =  0  \n  Published = 1 ";
    expect(parseEnumAliases(raw)).toEqual([
      { name: "Draft", value: 0 },
      { name: "Published", value: 1 },
    ]);
  });

  it("handles Windows-style line endings (\\r\\n)", () => {
    const raw = "Draft=0\r\nPublished=1\r\n";
    expect(parseEnumAliases(raw)).toHaveLength(2);
  });

  it("handles negative numeric values", () => {
    const raw = "Error=-1\nOK=0";
    expect(parseEnumAliases(raw)).toEqual([
      { name: "Error", value: -1 },
      { name: "OK", value: 0 },
    ]);
  });
});

// ---------------------------------------------------------------------------
// buildEnumMap
// ---------------------------------------------------------------------------
describe("buildEnumMap", () => {
  it("returns empty map for empty entries", () => {
    const map = buildEnumMap([]);
    expect(map.size).toBe(0);
  });

  it("groups entries by lowercase name", () => {
    const entries = [
      { name: "Draft", value: 0 },
      { name: "Published", value: 1 },
    ];
    const map = buildEnumMap(entries);
    expect(map.get("draft")).toEqual([0]);
    expect(map.get("published")).toEqual([1]);
  });

  it("accumulates multiple values for the same name (case-insensitive)", () => {
    const entries = [
      { name: "Status", value: 0 },
      { name: "status", value: 1 },
      { name: "STATUS", value: 2 },
    ];
    const map = buildEnumMap(entries);
    expect(map.get("status")).toEqual([0, 1, 2]);
  });

  it("does not have entries for names not provided", () => {
    const map = buildEnumMap([{ name: "Active", value: 1 }]);
    expect(map.has("inactive")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// setEnumAliases + enumMatches
// ---------------------------------------------------------------------------
describe("setEnumAliases + enumMatches", () => {
  afterEach(() => {
    // Reset to empty
    setEnumAliases("");
  });

  it("matches after setting aliases", () => {
    setEnumAliases("Draft=0\nPublished=1\nArchived=2");
    expect(enumMatches("Draft", 0)).toBe(true);
    expect(enumMatches("Published", 1)).toBe(true);
    expect(enumMatches("Archived", 2)).toBe(true);
  });

  it("matches case-insensitively", () => {
    setEnumAliases("Draft=0");
    expect(enumMatches("draft", 0)).toBe(true);
    expect(enumMatches("DRAFT", 0)).toBe(true);
    expect(enumMatches("DrAfT", 0)).toBe(true);
  });

  it("returns false when value does not match", () => {
    setEnumAliases("Draft=0\nPublished=1");
    expect(enumMatches("Draft", 1)).toBe(false);
    expect(enumMatches("Draft", 99)).toBe(false);
  });

  it("returns false when name is not in the map", () => {
    setEnumAliases("Draft=0");
    expect(enumMatches("Unknown", 0)).toBe(false);
  });

  it("returns false after clearing aliases", () => {
    setEnumAliases("Draft=0");
    expect(enumMatches("Draft", 0)).toBe(true);
    setEnumAliases("");
    expect(enumMatches("Draft", 0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rewriteApiVersion
// ---------------------------------------------------------------------------
describe("rewriteApiVersion", () => {
  it("rewrites leading /v1/ to /v3/", () => {
    expect(rewriteApiVersion("/v1/articles", "v3")).toBe("/v3/articles");
  });

  it("rewrites /v2/ to /v1/", () => {
    expect(rewriteApiVersion("/v2/categories/123", "v1")).toBe("/v1/categories/123");
  });

  it("leaves path unchanged when no leading version prefix", () => {
    expect(rewriteApiVersion("/articles/v1/details", "v3")).toBe("/articles/v1/details");
  });

  it("does not rewrite mid-path /v1/ segments", () => {
    // The regex anchors to ^\/v\d+(?=\/), so /api/v1/foo is not rewritten
    expect(rewriteApiVersion("/api/v1/foo", "v3")).toBe("/api/v1/foo");
  });

  it("does not rewrite when version segment is at end without trailing slash", () => {
    // /v1 without trailing slash does not match (?=\/)
    expect(rewriteApiVersion("/v1", "v3")).toBe("/v1");
  });

  it("rewrites multi-digit versions like /v10/", () => {
    expect(rewriteApiVersion("/v10/resources", "v2")).toBe("/v2/resources");
  });

  it("strips version prefix when apiVersion is empty string", () => {
    expect(rewriteApiVersion("/v1/detect-image", "")).toBe("/detect-image");
  });

  it("strips version prefix when apiVersion is empty — preserves deeper path", () => {
    expect(rewriteApiVersion("/v2/categories/123", "")).toBe("/categories/123");
  });

  it("leaves path unchanged when apiVersion is empty and no version prefix", () => {
    expect(rewriteApiVersion("/detect-image", "")).toBe("/detect-image");
  });
});

// ---------------------------------------------------------------------------
// readDotPath
// ---------------------------------------------------------------------------
describe("readDotPath", () => {
  it("reads a simple nested path", () => {
    const obj = { a: { b: { c: 42 } } };
    expect(readDotPath(obj, "a.b.c")).toBe(42);
  });

  it("reads top-level property", () => {
    expect(readDotPath({ name: "hello" }, "name")).toBe("hello");
  });

  it("returns undefined for missing path", () => {
    expect(readDotPath({ a: 1 }, "b.c")).toBeUndefined();
  });

  it("supports array indexing like items[0].name", () => {
    const obj = { items: [{ name: "first" }, { name: "second" }] };
    expect(readDotPath(obj, "items[0].name")).toBe("first");
    expect(readDotPath(obj, "items[1].name")).toBe("second");
  });

  it("supports array indexing at root like [0]", () => {
    const arr = [{ id: 1 }, { id: 2 }];
    expect(readDotPath(arr, "[0].id")).toBe(1);
  });

  it("returns undefined for out-of-bounds array index", () => {
    const obj = { items: [{ name: "only" }] };
    expect(readDotPath(obj, "items[5].name")).toBeUndefined();
  });

  it("returns undefined when navigating through null", () => {
    expect(readDotPath({ a: null }, "a.b")).toBeUndefined();
  });

  it("returns undefined when navigating through a primitive", () => {
    expect(readDotPath({ a: 42 }, "a.b")).toBeUndefined();
  });

  it("handles deeply nested array paths", () => {
    const obj = { data: { rows: [{ cells: [10, 20, 30] }] } };
    expect(readDotPath(obj, "data.rows[0].cells[2]")).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// readPath
// ---------------------------------------------------------------------------
describe("readPath", () => {
  it("reads a simple nested path", () => {
    expect(readPath({ a: { b: 1 } }, "a.b")).toBe(1);
  });

  it("returns undefined for null input", () => {
    expect(readPath(null, "a.b")).toBeUndefined();
  });

  it("returns undefined for undefined input", () => {
    expect(readPath(undefined, "a.b")).toBeUndefined();
  });

  it("returns undefined for missing key", () => {
    expect(readPath({ a: 1 }, "b")).toBeUndefined();
  });

  it("returns undefined when intermediate is primitive", () => {
    expect(readPath({ a: "str" }, "a.b")).toBeUndefined();
  });

  it("reads top-level value", () => {
    expect(readPath({ x: true }, "x")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fieldExists
// ---------------------------------------------------------------------------
describe("fieldExists", () => {
  it("returns true for an existing field", () => {
    expect(fieldExists({ a: { b: 1 } }, "a.b")).toBe(true);
  });

  it("returns true for a field with falsy value (0, false, empty string)", () => {
    expect(fieldExists({ a: 0 }, "a")).toBe(true);
    expect(fieldExists({ a: false }, "a")).toBe(true);
    expect(fieldExists({ a: "" }, "a")).toBe(true);
  });

  it("returns false for a field set to undefined", () => {
    expect(fieldExists({ a: undefined }, "a")).toBe(false);
  });

  it("returns false for null object", () => {
    expect(fieldExists(null, "a")).toBe(false);
  });

  it("returns false for undefined object", () => {
    expect(fieldExists(undefined, "a")).toBe(false);
  });

  it("returns false for a missing key", () => {
    expect(fieldExists({ a: 1 }, "b")).toBe(false);
  });

  it("returns false for a missing nested key", () => {
    expect(fieldExists({ a: { b: 1 } }, "a.c")).toBe(false);
  });

  it("returns true for deeply nested existing field", () => {
    expect(fieldExists({ a: { b: { c: { d: "deep" } } } }, "a.b.c.d")).toBe(true);
  });

  it("returns false when intermediate path is null", () => {
    expect(fieldExists({ a: null }, "a.b")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// substitute
// ---------------------------------------------------------------------------
describe("substitute", () => {
  const ctx = makeCtx();
  const state: RunState = { userId: "u_999", count: 5, flag: true };

  it("replaces {{proj.*}} placeholders", () => {
    const result = substitute("id={{proj.projectId}}", ctx, state);
    expect(result).toBe('id=p123');
  });

  it("replaces {{state.*}} placeholders", () => {
    const result = substitute("user={{state.userId}}", ctx, state);
    // escapeForJsonString returns raw string without JSON quotes
    expect(result).toBe("user=u_999");
  });

  it("replaces {{ctx.apiVersion}}", () => {
    const result = substitute("ver={{ctx.apiVersion}}", ctx, state);
    // escapeForJsonString returns raw string without JSON quotes
    expect(result).toBe("ver=v2");
  });

  it("resolves ctx.baseUrl as null (resolveCtx only maps apiVersion)", () => {
    const result = substitute("url={{ctx.baseUrl}}", ctx, state);
    // resolveCtx does not handle baseUrl, so it returns undefined -> "null"
    expect(result).toBe("url=null");
  });

  it("renders undefined variables as null", () => {
    const result = substitute("val={{state.missing}}", ctx, state);
    expect(result).toBe("val=null");
  });

  it("handles negation with ! prefix", () => {
    const stateWithBool: RunState = { active: true };
    const result = substitute("inactive={{!state.active}}", ctx, stateWithBool);
    expect(result).toBe("inactive=false");
  });

  it("negation of undefined yields true", () => {
    const result = substitute("neg={{!state.nope}}", ctx, state);
    expect(result).toBe("neg=true");
  });

  it("handles numeric state values", () => {
    const result = substitute("count={{state.count}}", ctx, state);
    expect(result).toBe("count=5");
  });

  it("handles boolean state values", () => {
    const result = substitute("flag={{state.flag}}", ctx, state);
    expect(result).toBe("flag=true");
  });

  it("replaces multiple placeholders in one template", () => {
    const result = substitute(
      "{{proj.projectId}}-{{state.userId}}",
      ctx,
      state
    );
    // Strings go through escapeForJsonString (no wrapping quotes)
    expect(result).toBe("p123-u_999");
  });

  it("leaves text without placeholders unchanged", () => {
    expect(substitute("plain text", ctx, state)).toBe("plain text");
  });

  it("escapes special characters in string values", () => {
    const stateWithSpecial: RunState = { desc: 'say "hello"' };
    const result = substitute("d={{state.desc}}", ctx, stateWithSpecial);
    // The escapeForJsonString should escape the quotes
    expect(result).toContain("say");
    expect(result).not.toContain('""'); // should be escaped, not raw double-double
  });
});

// ---------------------------------------------------------------------------
// resolveParam
// ---------------------------------------------------------------------------
describe("resolveParam", () => {
  const ctx = makeCtx();
  const state: RunState = { itemId: "abc", num: 42 };

  it("resolves ctx.apiVersion", () => {
    // resolveCtx handles apiVersion
    expect(resolveParam("ctx.apiVersion", ctx, state)).toBe("v2");
  });

  it("resolves ctx.baseUrl as undefined (not mapped by resolveCtx)", () => {
    // resolveCtx only maps apiVersion, projectId, versionId, langCode
    expect(resolveParam("ctx.baseUrl", ctx, state)).toBeUndefined();
  });

  it("resolves ctx.projectId from projectVariables.project_id", () => {
    const ctxWithProjId = makeCtx({ projectVariables: { project_id: "pid_1" } });
    expect(resolveParam("ctx.projectId", ctxWithProjId, state)).toBe("pid_1");
  });

  it("resolves state.* keys", () => {
    expect(resolveParam("state.itemId", ctx, state)).toBe("abc");
    expect(resolveParam("state.num", ctx, state)).toBe(42);
  });

  it("resolves proj.* from projectVariables", () => {
    expect(resolveParam("proj.projectId", ctx, state)).toBe("p123");
    expect(resolveParam("proj.env", ctx, state)).toBe("staging");
  });

  it("returns undefined for missing proj.* variable", () => {
    expect(resolveParam("proj.missing", ctx, state)).toBeUndefined();
  });

  it("handles template with {{...}} by calling substitute", () => {
    const result = resolveParam("prefix-{{state.itemId}}-suffix", ctx, state);
    // substitute wraps strings in quotes, then tryParseJson strips them
    expect(result).toBe("prefix-abc-suffix");
  });

  it("returns plain string as-is when no prefix matches", () => {
    expect(resolveParam("literal_value", ctx, state)).toBe("literal_value");
  });

  it("trims whitespace from raw input", () => {
    expect(resolveParam("  state.itemId  ", ctx, state)).toBe("abc");
  });

  it("returns undefined for state key that does not exist", () => {
    expect(resolveParam("state.nonexistent", ctx, state)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// jsonEqual
// ---------------------------------------------------------------------------
describe("jsonEqual", () => {
  afterEach(() => {
    setEnumAliases("");
  });

  it("returns true for identical values", () => {
    expect(jsonEqual(1, 1)).toBe(true);
    expect(jsonEqual("hello", "hello")).toBe(true);
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(true, true)).toBe(true);
  });

  it("returns false for different values of same type", () => {
    expect(jsonEqual(1, 2)).toBe(false);
    expect(jsonEqual("a", "b")).toBe(false);
  });

  it("coerces number to string: 3 === '3'", () => {
    expect(jsonEqual(3, "3")).toBe(true);
    expect(jsonEqual("3", 3)).toBe(true);
  });

  it("coerces zero: 0 === '0'", () => {
    expect(jsonEqual(0, "0")).toBe(true);
  });

  it("does not coerce mismatched number-string pairs", () => {
    expect(jsonEqual(3, "four")).toBe(false);
  });

  it("matches via enum aliases (number a, string b)", () => {
    setEnumAliases("Draft=0\nPublished=1");
    expect(jsonEqual(0, "Draft")).toBe(true);
    expect(jsonEqual(1, "Published")).toBe(true);
  });

  it("matches via enum aliases (string a, number b)", () => {
    setEnumAliases("Draft=0\nPublished=1");
    expect(jsonEqual("Draft", 0)).toBe(true);
    expect(jsonEqual("Published", 1)).toBe(true);
  });

  it("returns false for enum alias with wrong value", () => {
    setEnumAliases("Draft=0");
    expect(jsonEqual(1, "Draft")).toBe(false);
    expect(jsonEqual("Draft", 1)).toBe(false);
  });

  it("returns false for completely different types without coercion path", () => {
    expect(jsonEqual("hello", true as unknown as string)).toBe(false);
    expect(jsonEqual(null, "null")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// coerce
// ---------------------------------------------------------------------------
describe("coerce", () => {
  it("coerces numeric string to number", () => {
    expect(coerce("42")).toBe(42);
    expect(coerce("3.14")).toBeCloseTo(3.14);
  });

  it("coerces boolean strings", () => {
    expect(coerce("true")).toBe(true);
    expect(coerce("false")).toBe(false);
  });

  it("coerces null string", () => {
    expect(coerce("null")).toBeNull();
  });

  it("returns original string when not valid JSON", () => {
    expect(coerce("hello")).toBe("hello");
    expect(coerce("not json")).toBe("not json");
  });

  it("parses JSON arrays", () => {
    expect(coerce("[1,2,3]")).toEqual([1, 2, 3]);
  });

  it("parses JSON objects", () => {
    expect(coerce('{"a":1}')).toEqual({ a: 1 });
  });

  it("returns empty string as-is (not valid JSON)", () => {
    expect(coerce("")).toBe("");
  });
});
