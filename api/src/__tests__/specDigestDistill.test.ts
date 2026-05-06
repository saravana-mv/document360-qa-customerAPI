/**
 * Unit tests for specDigest.ts and specDistillCache.ts
 */

jest.mock("../lib/blobClient", () => ({
  downloadBlob: jest.fn(),
  uploadBlob: jest.fn(),
  listBlobs: jest.fn(),
  deleteBlob: jest.fn(),
  renameBlob: jest.fn(),
}));

jest.mock("../lib/aiClient", () => ({
  callAI: jest.fn(),
}));

jest.mock("../lib/specRequiredFields", () => ({
  distillSpecContext: jest.fn((input: string) => `DISTILLED:${input}`),
}));

jest.mock("../lib/specDependencies", () => ({
  invalidateDependencies: jest.fn().mockResolvedValue(undefined),
}));

import {
  downloadBlob,
  uploadBlob,
  listBlobs,
  deleteBlob,
  renameBlob,
} from "../lib/blobClient";
import { distillSpecContext } from "../lib/specRequiredFields";

import {
  rebuildDigest,
  invalidateDigest,
  readDigest,
} from "../lib/specDigest";

import {
  distilledPath,
  distillAndStore,
  deleteDistilled,
  renameDistilled,
  distillAndStoreWithResult,
  readDistilledContent,
} from "../lib/specDistillCache";

const mockDownload = downloadBlob as jest.Mock;
const mockUpload = uploadBlob as jest.Mock;
const mockList = listBlobs as jest.Mock;
const mockDelete = deleteBlob as jest.Mock;
const mockRename = renameBlob as jest.Mock;
const mockDistill = distillSpecContext as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // Default: distill returns a transformed string (different from input)
  mockDistill.mockImplementation((input: string) => `DISTILLED:${input}`);
});

// =====================================================================
// specDistillCache — distilledPath (pure)
// =====================================================================

describe("distilledPath", () => {
  it("inserts _distilled/ before the filename", () => {
    expect(distilledPath("V3/articles/create.md")).toBe(
      "V3/articles/_distilled/create.md",
    );
  });

  it("handles root-level files with no folder", () => {
    expect(distilledPath("create.md")).toBe("_distilled/create.md");
  });

  it("handles deeply nested paths", () => {
    expect(distilledPath("proj/V3/a/b/c/endpoint.md")).toBe(
      "proj/V3/a/b/c/_distilled/endpoint.md",
    );
  });
});

// =====================================================================
// specDistillCache — distillAndStore
// =====================================================================

describe("distillAndStore", () => {
  it("distills and uploads companion blob for .md files", async () => {
    mockUpload.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    await distillAndStore("proj/V3/articles/create.md", "raw spec content");

    expect(mockDistill).toHaveBeenCalledTimes(1);
    // Wrapped with section header
    expect(mockDistill).toHaveBeenCalledWith("## create.md\n\nraw spec content");
    expect(mockUpload).toHaveBeenCalledWith(
      "proj/V3/articles/_distilled/create.md",
      expect.stringContaining("<!-- distill-v"),
      "text/markdown",
    );
  });

  it("skips non-.md files", async () => {
    await distillAndStore("proj/V3/_sources.json", "{}");
    expect(mockDistill).not.toHaveBeenCalled();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("skips files inside _distilled/ folders", async () => {
    await distillAndStore("proj/V3/articles/_distilled/create.md", "content");
    expect(mockDistill).not.toHaveBeenCalled();
  });

  it("skips files inside _versions/ folders", async () => {
    await distillAndStore("proj/V3/_versions/old.md", "content");
    expect(mockDistill).not.toHaveBeenCalled();
  });

  it("does not upload when distillation returns unchanged content", async () => {
    // If distill returns the same string, no companion is stored
    mockDistill.mockImplementation((input: string) => input);

    await distillAndStore("proj/V3/articles/create.md", "raw spec content");

    expect(mockDistill).toHaveBeenCalledTimes(1);
    expect(mockUpload).not.toHaveBeenCalled();
  });
});

// =====================================================================
// specDistillCache — distillAndStoreWithResult
// =====================================================================

describe("distillAndStoreWithResult", () => {
  it("returns 'distilled' when content was transformed", async () => {
    mockUpload.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    const result = await distillAndStoreWithResult(
      "proj/V3/articles/create.md",
      "raw content",
    );
    expect(result).toBe("distilled");
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });

  it("returns 'unchanged' when distill returns same content", async () => {
    mockDistill.mockImplementation((input: string) => input);

    const result = await distillAndStoreWithResult(
      "proj/V3/articles/create.md",
      "raw content",
    );
    expect(result).toBe("unchanged");
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("returns 'unchanged' for non-.md files", async () => {
    const result = await distillAndStoreWithResult("proj/V3/data.json", "{}");
    expect(result).toBe("unchanged");
  });
});

// =====================================================================
// specDistillCache — deleteDistilled
// =====================================================================

describe("deleteDistilled", () => {
  it("deletes the companion blob", async () => {
    mockDelete.mockResolvedValue(undefined);

    await deleteDistilled("proj/V3/articles/create.md");

    expect(mockDelete).toHaveBeenCalledWith(
      "proj/V3/articles/_distilled/create.md",
    );
  });

  it("skips non-.md files", async () => {
    await deleteDistilled("proj/V3/data.json");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("skips files already in _distilled/", async () => {
    await deleteDistilled("proj/V3/articles/_distilled/create.md");
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does not throw if companion does not exist", async () => {
    mockDelete.mockRejectedValue(new Error("BlobNotFound"));

    await expect(
      deleteDistilled("proj/V3/articles/create.md"),
    ).resolves.toBeUndefined();
  });
});

// =====================================================================
// specDistillCache — renameDistilled
// =====================================================================

describe("renameDistilled", () => {
  it("renames the companion blob", async () => {
    mockRename.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    await renameDistilled(
      "proj/V3/articles/old.md",
      "proj/V3/articles/new.md",
    );

    expect(mockRename).toHaveBeenCalledWith(
      "proj/V3/articles/_distilled/old.md",
      "proj/V3/articles/_distilled/new.md",
    );
  });

  it("skips non-.md files", async () => {
    await renameDistilled("proj/V3/a.json", "proj/V3/b.json");
    expect(mockRename).not.toHaveBeenCalled();
  });

  it("skips files in _distilled/", async () => {
    await renameDistilled(
      "proj/V3/_distilled/a.md",
      "proj/V3/_distilled/b.md",
    );
    expect(mockRename).not.toHaveBeenCalled();
  });
});

// =====================================================================
// specDistillCache — readDistilledContent
// =====================================================================

describe("readDistilledContent", () => {
  it("returns cached content on version hit", async () => {
    mockDownload.mockResolvedValueOnce(
      "<!-- distill-v9 -->\nDistilled content here",
    );

    const result = await readDistilledContent("proj/V3/articles/create.md");

    expect(result).toBe("<!-- distill-v9 -->\nDistilled content here");
    // Should read from companion path
    expect(mockDownload).toHaveBeenCalledWith(
      "proj/V3/articles/_distilled/create.md",
    );
  });

  it("re-distills on stale cache version", async () => {
    // First call: stale version
    mockDownload
      .mockResolvedValueOnce("<!-- distill-v1 -->\nStale content")
      // Second call: raw content fallback
      .mockResolvedValueOnce("raw spec content");
    mockUpload.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    const result = await readDistilledContent("proj/V3/articles/create.md");

    // Should have read both companion and raw
    expect(mockDownload).toHaveBeenCalledTimes(2);
    // distill called once for runtime + once inside fire-and-forget distillAndStore
    expect(mockDistill).toHaveBeenCalledTimes(2);
    expect(result).toContain("<!-- distill-v9 -->");
  });

  it("falls back to runtime distillation on cache miss", async () => {
    mockDownload
      .mockRejectedValueOnce(new Error("BlobNotFound"))
      .mockResolvedValueOnce("raw spec content");
    mockUpload.mockResolvedValue(undefined);
    mockDelete.mockResolvedValue(undefined);

    const result = await readDistilledContent("proj/V3/articles/create.md");

    expect(mockDownload).toHaveBeenCalledTimes(2);
    // distill called once for runtime + once inside fire-and-forget distillAndStore
    expect(mockDistill).toHaveBeenCalledTimes(2);
    expect(result).toContain("DISTILLED:");
  });
});

// =====================================================================
// specDigest — rebuildDigest
// =====================================================================

describe("rebuildDigest", () => {
  it("builds digest from distilled spec blobs", async () => {
    mockList.mockResolvedValue([
      { name: "proj1/V3/articles/create.md" },
      { name: "proj1/V3/articles/list.md" },
    ]);

    // readDistilledContent reads companion blob
    const distilledCreate = [
      "## Endpoint: POST /v3/projects/{project_id}/articles",
      "**Create a new article**",
      "**REQUIRED FIELDS: `title`, `content`**",
      "### Response (201)",
      "Key fields: `id`, `title`, `slug`",
    ].join("\n");

    const distilledList = [
      "## Endpoint: GET /v3/projects/{project_id}/articles",
      "**List all articles**",
      "### Response (200)",
      "Key fields: `data`, `total`",
    ].join("\n");

    // Mock readDistilledContent via downloadBlob (companion hits)
    mockDownload
      .mockResolvedValueOnce(`<!-- distill-v9 -->\n${distilledCreate}`)
      .mockResolvedValueOnce(`<!-- distill-v9 -->\n${distilledList}`);

    mockUpload.mockResolvedValue(undefined);

    const digest = await rebuildDigest("proj1", "V3");

    expect(mockList).toHaveBeenCalledWith("proj1/V3/");
    expect(mockUpload).toHaveBeenCalledWith(
      "proj1/V3/_system/_digest.md",
      expect.stringContaining("<!-- digest-v1 -->"),
      "text/markdown",
    );
    // Verify content has endpoint entries
    expect(digest).toContain("POST /v3/projects/{project_id}/articles");
    expect(digest).toContain("GET /v3/projects/{project_id}/articles");
    expect(digest).toContain("2 endpoints");
  });

  it("filters out _distilled, _versions, _system blobs", async () => {
    mockList.mockResolvedValue([
      { name: "proj1/V3/articles/create.md" },
      { name: "proj1/V3/articles/_distilled/create.md" },
      { name: "proj1/V3/_versions/old.md" },
      { name: "proj1/V3/_system/_digest.md" },
      { name: "proj1/V3/_system/_rules.json" },
    ]);

    const distilled = [
      "## Endpoint: POST /v3/articles",
      "**Create article**",
    ].join("\n");
    mockDownload.mockResolvedValueOnce(`<!-- distill-v9 -->\n${distilled}`);
    mockUpload.mockResolvedValue(undefined);

    await rebuildDigest("proj1", "V3");

    // Only 1 blob should be processed (the non-system one)
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it("handles empty folder gracefully", async () => {
    mockList.mockResolvedValue([]);
    mockUpload.mockResolvedValue(undefined);

    const digest = await rebuildDigest("proj1", "V3");

    expect(digest).toContain("0 endpoints");
    expect(mockUpload).toHaveBeenCalledTimes(1);
  });
});

// =====================================================================
// specDigest — invalidateDigest
// =====================================================================

describe("invalidateDigest", () => {
  it("deletes the digest blob for the version folder", async () => {
    mockDelete.mockResolvedValue(undefined);

    await invalidateDigest("proj1/V3/articles/create.md");

    expect(mockDelete).toHaveBeenCalledWith("proj1/V3/_system/_digest.md");
  });

  it("does nothing if no version folder is found", async () => {
    await invalidateDigest("articles/create.md");

    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("does not throw if digest blob does not exist", async () => {
    mockDelete.mockRejectedValue(new Error("BlobNotFound"));

    await expect(
      invalidateDigest("proj1/V3/articles/create.md"),
    ).resolves.toBeUndefined();
  });
});

// =====================================================================
// specDigest — readDigest
// =====================================================================

describe("readDigest", () => {
  it("returns content when digest version matches", async () => {
    const content = "<!-- digest-v1 -->\n# API Endpoint Digest";
    mockDownload.mockResolvedValue(content);

    const result = await readDigest("proj1", "V3");

    expect(result).toBe(content);
    expect(mockDownload).toHaveBeenCalledWith("proj1/V3/_system/_digest.md");
  });

  it("returns null for stale digest version", async () => {
    mockDownload.mockResolvedValue("<!-- digest-v0 -->\nOld digest");

    const result = await readDigest("proj1", "V3");

    expect(result).toBeNull();
  });

  it("returns null when digest blob does not exist", async () => {
    mockDownload.mockRejectedValue(new Error("BlobNotFound"));

    const result = await readDigest("proj1", "V3");

    expect(result).toBeNull();
  });

  it("uses folderPath directly when projectId is 'unknown'", async () => {
    mockDownload.mockRejectedValue(new Error("BlobNotFound"));

    await readDigest("unknown", "V3");

    expect(mockDownload).toHaveBeenCalledWith("V3/_system/_digest.md");
  });

  it("normalizes trailing slash in path", async () => {
    mockDownload.mockRejectedValue(new Error("BlobNotFound"));

    await readDigest("proj1", "V3/");

    expect(mockDownload).toHaveBeenCalledWith("proj1/V3/_system/_digest.md");
  });
});
