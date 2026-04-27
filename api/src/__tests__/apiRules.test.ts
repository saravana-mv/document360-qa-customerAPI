import { extractVersionFolder, loadApiRules, injectApiRules } from "../lib/apiRules";

// ── Mocks ──────────────────────────────────────────────────────────────────

jest.mock("../lib/blobClient", () => ({
  downloadBlob: jest.fn(),
}));

jest.mock("../lib/cosmosClient", () => ({
  getSettingsContainer: jest.fn(),
}));

import { downloadBlob } from "../lib/blobClient";
import { getSettingsContainer } from "../lib/cosmosClient";

const mockDownloadBlob = downloadBlob as jest.MockedFunction<typeof downloadBlob>;
const mockGetSettingsContainer = getSettingsContainer as jest.MockedFunction<typeof getSettingsContainer>;

beforeEach(() => {
  jest.resetAllMocks();
});

// ── extractVersionFolder ───────────────────────────────────────────────────

describe("extractVersionFolder", () => {
  it("extracts the first segment from a single path", () => {
    expect(extractVersionFolder("v3/articles/get.md")).toBe("v3");
  });

  it("strips leading slashes", () => {
    expect(extractVersionFolder("/v3/articles/get.md")).toBe("v3");
    expect(extractVersionFolder("///v3/articles/get.md")).toBe("v3");
  });

  it("extracts from the first non-empty path in an array", () => {
    expect(extractVersionFolder(["v2/foo.md", "v3/bar.md"])).toBe("v2");
  });

  it("skips empty strings in array and returns first valid segment", () => {
    expect(extractVersionFolder(["", "/v5/x.md"])).toBe("v5");
  });

  it("returns null for an empty string", () => {
    expect(extractVersionFolder("")).toBeNull();
  });

  it("returns null for an empty array", () => {
    expect(extractVersionFolder([])).toBeNull();
  });

  it("returns the folder even when there is no subfolder", () => {
    expect(extractVersionFolder("v1")).toBe("v1");
  });
});

// ── injectApiRules ─────────────────────────────────────────────────────────

describe("injectApiRules", () => {
  const base = "You are a test generator.";

  it("appends non-empty rules to the base prompt", () => {
    const result = injectApiRules(base, "Rule 1\nRule 2");
    expect(result).toContain(base);
    expect(result).toContain("## Project-Specific API Rules");
    expect(result).toContain("Rule 1\nRule 2");
  });

  it("returns the base prompt unchanged when rules are empty", () => {
    expect(injectApiRules(base, "")).toBe(base);
  });

  it("returns the base prompt unchanged when rules are whitespace only", () => {
    expect(injectApiRules(base, "   \n  ")).toBe(base);
  });

  it("trims surrounding whitespace from rules", () => {
    const result = injectApiRules(base, "  some rule  ");
    expect(result).toContain("some rule");
    expect(result).not.toMatch(/some rule\s{2,}/);
  });
});

// ── loadApiRules ───────────────────────────────────────────────────────────

describe("loadApiRules", () => {
  it("returns empty for unknown projectId", async () => {
    const result = await loadApiRules("unknown");
    expect(result).toEqual({ rules: "", enumAliases: "" });
    expect(mockDownloadBlob).not.toHaveBeenCalled();
  });

  it("returns empty for empty projectId", async () => {
    const result = await loadApiRules("");
    expect(result).toEqual({ rules: "", enumAliases: "" });
  });

  // ── _system/_skills.md path ──────────────────────────────────────────

  it("returns _skills.md content when available", async () => {
    const md = "## Lessons Learned\n- some lesson";
    mockDownloadBlob.mockResolvedValueOnce(md);

    const result = await loadApiRules("proj1", "v3");

    expect(mockDownloadBlob).toHaveBeenCalledWith("proj1/v3/_system/_skills.md");
    expect(result.rules).toBe(md);
  });

  it("parses enum aliases from _skills.md markdown", async () => {
    const md = [
      "## Lessons Learned",
      "some lesson",
      "## Enum Aliases",
      "```",
      "status.active=1",
      "status.inactive=0",
      "<!-- comment -->",
      "```",
    ].join("\n");
    mockDownloadBlob.mockResolvedValueOnce(md);

    const result = await loadApiRules("proj1", "v3");

    expect(result.enumAliases).toBe("status.active=1\nstatus.inactive=0");
  });

  it("returns empty enumAliases when no alias section in markdown", async () => {
    const md = "## Lessons Learned\n- no aliases here";
    mockDownloadBlob.mockResolvedValueOnce(md);

    const result = await loadApiRules("proj1", "v3");

    expect(result.enumAliases).toBe("");
  });

  // ── Fallback: legacy Skills.md ───────────────────────────────────────

  it("falls through to legacy Skills.md when _system/_skills.md fails", async () => {
    const legacyMd = "## Legacy skills content";
    mockDownloadBlob
      .mockRejectedValueOnce(new Error("not found"))   // _system/_skills.md
      .mockResolvedValueOnce(legacyMd);                 // Skills.md

    const result = await loadApiRules("proj1", "v3");

    expect(mockDownloadBlob).toHaveBeenCalledWith("proj1/v3/Skills.md");
    expect(result.rules).toBe(legacyMd);
  });

  // ── Fallback: _rules.json ────────────────────────────────────────────

  it("falls through to _rules.json when both skills files fail", async () => {
    const rulesJson = JSON.stringify({ rules: "json rule", enumAliases: "x=1" });
    mockDownloadBlob
      .mockRejectedValueOnce(new Error("not found"))   // _system/_skills.md
      .mockRejectedValueOnce(new Error("not found"))   // Skills.md
      .mockResolvedValueOnce(rulesJson);                // _rules.json

    const result = await loadApiRules("proj1", "v3");

    expect(mockDownloadBlob).toHaveBeenCalledWith("proj1/v3/_rules.json");
    expect(result).toEqual({ rules: "json rule", enumAliases: "x=1" });
  });

  it("handles partial _rules.json (only rules, no enumAliases)", async () => {
    const rulesJson = JSON.stringify({ rules: "just rules" });
    mockDownloadBlob
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("not found"))
      .mockResolvedValueOnce(rulesJson);

    const result = await loadApiRules("proj1", "v3");

    expect(result).toEqual({ rules: "just rules", enumAliases: "" });
  });

  // ── Fallback: Cosmos settings ────────────────────────────────────────

  it("falls through to Cosmos when all blob paths fail", async () => {
    mockDownloadBlob.mockRejectedValue(new Error("not found"));

    const mockRead = jest.fn().mockResolvedValue({
      resource: { rules: "cosmos rule", enumAliases: "y=2" },
    });
    const mockItem = jest.fn().mockReturnValue({ read: mockRead });
    mockGetSettingsContainer.mockResolvedValue({ item: mockItem } as any);

    const result = await loadApiRules("proj1", "v3");

    expect(mockItem).toHaveBeenCalledWith("api_rules", "proj1");
    expect(result).toEqual({ rules: "cosmos rule", enumAliases: "y=2" });
  });

  it("falls back to Cosmos when no versionFolder provided", async () => {
    const mockRead = jest.fn().mockResolvedValue({
      resource: { rules: "global rule", enumAliases: "" },
    });
    const mockItem = jest.fn().mockReturnValue({ read: mockRead });
    mockGetSettingsContainer.mockResolvedValue({ item: mockItem } as any);

    const result = await loadApiRules("proj1");

    expect(mockDownloadBlob).not.toHaveBeenCalled();
    expect(result).toEqual({ rules: "global rule", enumAliases: "" });
  });

  // ── Everything fails ─────────────────────────────────────────────────

  it("returns empty when everything fails", async () => {
    mockDownloadBlob.mockRejectedValue(new Error("not found"));
    mockGetSettingsContainer.mockRejectedValue(new Error("cosmos down"));

    const result = await loadApiRules("proj1", "v3");

    expect(result).toEqual({ rules: "", enumAliases: "" });
  });

  // ── Edge: empty blob content skipped ─────────────────────────────────

  it("skips _skills.md if content is empty/whitespace and tries next", async () => {
    mockDownloadBlob
      .mockResolvedValueOnce("   ")                      // _system/_skills.md — empty
      .mockResolvedValueOnce("## Real legacy content");   // Skills.md

    const result = await loadApiRules("proj1", "v3");

    expect(result.rules).toBe("## Real legacy content");
  });
});
