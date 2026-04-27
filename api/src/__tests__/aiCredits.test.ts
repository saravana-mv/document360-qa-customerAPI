/**
 * Unit tests for api/src/lib/aiCredits.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockUpsert = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();

// Track which item ID is being accessed so read/replace return context-aware results
let lastItemId = "";
let lastPartitionKey = "";

jest.mock("../lib/cosmosClient", () => ({
  getAiUsageContainer: jest.fn().mockResolvedValue({
    items: {
      upsert: (...args: any[]) => mockUpsert(...args),
    },
    item: (id: any, partitionKey: any) => {
      lastItemId = id;
      lastPartitionKey = partitionKey;
      return {
        read: (...args: any[]) => mockRead(id, partitionKey, ...args),
        replace: (...args: any[]) => mockReplace(id, partitionKey, ...args),
      };
    },
  }),
}));

import {
  seedProjectCredits,
  getProjectCredits,
  getUserCredits,
  checkCredits,
  recordUsage,
  updateProjectBudget,
  updateUserBudget,
} from "../lib/aiCredits";
import type { ProjectCreditsDoc, UserCreditsDoc } from "../lib/aiCredits";

beforeEach(() => {
  jest.clearAllMocks();
  lastItemId = "";
  lastPartitionKey = "";
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeProjectDoc(overrides: Partial<ProjectCreditsDoc> = {}): ProjectCreditsDoc {
  return {
    id: "credits_proj1",
    projectId: "proj1",
    type: "project_credits",
    totalBudgetUsd: 5.0,
    usedUsd: 0,
    callCount: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "owner1",
    _etag: "etag-proj",
    ...overrides,
  };
}

function makeUserDoc(overrides: Partial<UserCreditsDoc> = {}): UserCreditsDoc {
  return {
    id: "user_credits_user1_proj1",
    projectId: "proj1",
    type: "user_credits",
    userId: "user1",
    displayName: "Test User",
    totalBudgetUsd: 2.0,
    usedUsd: 0,
    callCount: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "user1",
    _etag: "etag-user",
    ...overrides,
  };
}

// ── seedProjectCredits ───────────────────────────────────────────────────────

describe("seedProjectCredits", () => {
  it("upserts a project credits doc with default budget", async () => {
    mockUpsert.mockResolvedValueOnce({});
    await seedProjectCredits("proj1", "owner1");

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const doc = mockUpsert.mock.calls[0][0];
    expect(doc.id).toBe("credits_proj1");
    expect(doc.projectId).toBe("proj1");
    expect(doc.type).toBe("project_credits");
    expect(doc.totalBudgetUsd).toBe(5.0);
    expect(doc.usedUsd).toBe(0);
    expect(doc.callCount).toBe(0);
    expect(doc.updatedBy).toBe("owner1");
    expect(doc.updatedAt).toBeDefined();
  });

  it("upserts with custom budget when provided", async () => {
    mockUpsert.mockResolvedValueOnce({});
    await seedProjectCredits("proj2", "admin", 10.0);

    const doc = mockUpsert.mock.calls[0][0];
    expect(doc.totalBudgetUsd).toBe(10.0);
    expect(doc.id).toBe("credits_proj2");
  });
});

// ── getProjectCredits ────────────────────────────────────────────────────────

describe("getProjectCredits", () => {
  it("returns the project credits doc when found", async () => {
    const projDoc = makeProjectDoc();
    mockRead.mockResolvedValueOnce({ resource: projDoc });

    const result = await getProjectCredits("proj1");
    expect(result).toEqual(projDoc);
    expect(mockRead).toHaveBeenCalledWith("credits_proj1", "proj1");
  });

  it("returns null when resource is undefined", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

    const result = await getProjectCredits("proj1");
    expect(result).toBeNull();
  });

  it("returns null on read error", async () => {
    mockRead.mockRejectedValueOnce(new Error("Not found"));

    const result = await getProjectCredits("proj1");
    expect(result).toBeNull();
  });
});

// ── getUserCredits ───────────────────────────────────────────────────────────

describe("getUserCredits", () => {
  it("returns the user credits doc when found", async () => {
    const userDoc = makeUserDoc();
    mockRead.mockResolvedValueOnce({ resource: userDoc });

    const result = await getUserCredits("user1", "proj1");
    expect(result).toEqual(userDoc);
    expect(mockRead).toHaveBeenCalledWith("user_credits_user1_proj1", "proj1");
  });

  it("returns null when resource is undefined", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

    const result = await getUserCredits("user1", "proj1");
    expect(result).toBeNull();
  });

  it("returns null on read error", async () => {
    mockRead.mockRejectedValueOnce(new Error("Not found"));

    const result = await getUserCredits("user1", "proj1");
    expect(result).toBeNull();
  });
});

// ── checkCredits ─────────────────────────────────────────────────────────────

describe("checkCredits", () => {
  it("returns allowed when both project and user have budget remaining", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 1.0, totalBudgetUsd: 5.0 });
    const userDoc = makeUserDoc({ usedUsd: 0.5, totalBudgetUsd: 2.0 });

    // getProjectCredits read
    mockRead.mockResolvedValueOnce({ resource: projDoc });
    // getUserCredits read
    mockRead.mockResolvedValueOnce({ resource: userDoc });

    const result = await checkCredits("proj1", "user1", "Test User");

    expect(result.allowed).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.projectCredits).toEqual({
      usedUsd: 1.0,
      totalBudgetUsd: 5.0,
      remainingUsd: 4.0,
    });
    expect(result.userCredits).toEqual({
      usedUsd: 0.5,
      totalBudgetUsd: 2.0,
      remainingUsd: 1.5,
    });
  });

  it("returns denied when project credits are exhausted", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 5.0, totalBudgetUsd: 5.0 });

    mockRead.mockResolvedValueOnce({ resource: projDoc });

    const result = await checkCredits("proj1", "user1", "Test User");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Project AI credits exhausted");
    expect(result.projectCredits).toEqual({
      usedUsd: 5.0,
      totalBudgetUsd: 5.0,
      remainingUsd: 0,
    });
    // User credits should not be checked when project is exhausted
    expect(result.userCredits).toBeUndefined();
  });

  it("returns denied when user credits are exhausted", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 1.0, totalBudgetUsd: 5.0 });
    const userDoc = makeUserDoc({ usedUsd: 2.0, totalBudgetUsd: 2.0 });

    mockRead.mockResolvedValueOnce({ resource: projDoc });
    mockRead.mockResolvedValueOnce({ resource: userDoc });

    const result = await checkCredits("proj1", "user1", "Test User");

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Your AI credits for this project are exhausted");
    expect(result.userCredits).toEqual({
      usedUsd: 2.0,
      totalBudgetUsd: 2.0,
      remainingUsd: 0,
    });
  });

  it("auto-seeds project credits when missing", async () => {
    // First getProjectCredits returns null (not found)
    mockRead.mockRejectedValueOnce(new Error("Not found"));
    // seedProjectCredits upserts
    mockUpsert.mockResolvedValueOnce({});
    // Second getProjectCredits returns the seeded doc
    const seededProjDoc = makeProjectDoc({ updatedBy: "system" });
    mockRead.mockResolvedValueOnce({ resource: seededProjDoc });
    // getUserCredits returns a user doc
    const userDoc = makeUserDoc();
    mockRead.mockResolvedValueOnce({ resource: userDoc });

    const result = await checkCredits("proj1", "user1", "Test User");

    expect(result.allowed).toBe(true);
    // seedProjectCredits was called
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const seedDoc = mockUpsert.mock.calls[0][0];
    expect(seedDoc.type).toBe("project_credits");
    expect(seedDoc.updatedBy).toBe("system");
  });

  it("auto-seeds user credits when missing", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 0 });

    // getProjectCredits returns a doc
    mockRead.mockResolvedValueOnce({ resource: projDoc });
    // getUserCredits returns not found
    mockRead.mockRejectedValueOnce(new Error("Not found"));
    // seedUserCredits upserts
    mockUpsert.mockResolvedValueOnce({});

    const result = await checkCredits("proj1", "user1", "Test User");

    expect(result.allowed).toBe(true);
    // seedUserCredits was called
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const seedDoc = mockUpsert.mock.calls[0][0];
    expect(seedDoc.type).toBe("user_credits");
    expect(seedDoc.userId).toBe("user1");
    expect(seedDoc.displayName).toBe("Test User");
    expect(seedDoc.totalBudgetUsd).toBe(2.0);
  });

  it("returns denied when project overspent (usedUsd > totalBudgetUsd)", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 6.0, totalBudgetUsd: 5.0 });
    mockRead.mockResolvedValueOnce({ resource: projDoc });

    const result = await checkCredits("proj1", "user1", "Test User");
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe("Project AI credits exhausted");
  });
});

// ── recordUsage ──────────────────────────────────────────────────────────────

describe("recordUsage", () => {
  it("updates both project and user docs with incremented cost and count", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 1.0, callCount: 5 });
    const userDoc = makeUserDoc({ usedUsd: 0.5, callCount: 2 });

    // Project read
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    // Project replace
    mockReplace.mockResolvedValueOnce({ resource: {} });
    // User read
    mockRead.mockResolvedValueOnce({ resource: { ...userDoc } });
    // User replace
    mockReplace.mockResolvedValueOnce({ resource: {} });

    await recordUsage("proj1", "user1", "Test User", 0.05);

    // Project replace was called
    expect(mockReplace).toHaveBeenCalledTimes(2);

    // Check project doc update
    const projReplaceDoc = mockReplace.mock.calls[0][2]; // (id, pk, doc, options)
    expect(projReplaceDoc.usedUsd).toBeCloseTo(1.05, 6);
    expect(projReplaceDoc.callCount).toBe(6);
    expect(projReplaceDoc.lastUsedAt).toBeDefined();
    expect(projReplaceDoc.updatedBy).toBe("user1");

    // Check user doc update
    const userReplaceDoc = mockReplace.mock.calls[1][2]; // (id, pk, doc, options)
    expect(userReplaceDoc.usedUsd).toBeCloseTo(0.55, 6);
    expect(userReplaceDoc.callCount).toBe(3);
    expect(userReplaceDoc.lastUsedAt).toBeDefined();
    expect(userReplaceDoc.updatedBy).toBe("user1");
  });

  it("retries project update on etag conflict", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 1.0, callCount: 5 });
    const userDoc = makeUserDoc({ usedUsd: 0.5, callCount: 2 });

    // First project read
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    // First project replace fails (etag conflict)
    mockReplace.mockRejectedValueOnce(new Error("Precondition failed"));
    // Retry project read
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc, usedUsd: 1.1, callCount: 6 } });
    // Retry project replace succeeds
    mockReplace.mockResolvedValueOnce({ resource: {} });
    // User read
    mockRead.mockResolvedValueOnce({ resource: { ...userDoc } });
    // User replace
    mockReplace.mockResolvedValueOnce({ resource: {} });

    await recordUsage("proj1", "user1", "Test User", 0.05);

    // 3 replaces: first project (rejected), retry project (resolved), user (resolved)
    expect(mockReplace).toHaveBeenCalledTimes(3);
    // The retry replace (second call) should have fresh usedUsd + cost
    const retryDoc = mockReplace.mock.calls[1][2];
    expect(retryDoc.usedUsd).toBeCloseTo(1.15, 6);
    expect(retryDoc.callCount).toBe(7);
  });

  it("auto-seeds and updates user credits when user doc is missing", async () => {
    const projDoc = makeProjectDoc({ usedUsd: 0 });

    // Project read
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    // Project replace
    mockReplace.mockResolvedValueOnce({ resource: {} });
    // User read returns no resource
    mockRead.mockResolvedValueOnce({ resource: undefined });
    // seedUserCredits upsert
    mockUpsert.mockResolvedValueOnce({});
    // Replace after seeding
    mockReplace.mockResolvedValueOnce({ resource: {} });

    await recordUsage("proj1", "user1", "Test User", 0.03);

    // seedUserCredits was called
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const seedDoc = mockUpsert.mock.calls[0][0];
    expect(seedDoc.type).toBe("user_credits");

    // The replace after seeding should set the cost
    const userReplaceDoc = mockReplace.mock.calls[1][2];
    expect(userReplaceDoc.usedUsd).toBe(0.03);
    expect(userReplaceDoc.callCount).toBe(1);
  });

  it("does not throw when project doc is missing (no resource)", async () => {
    // Project read returns undefined
    mockRead.mockResolvedValueOnce({ resource: undefined });
    // User read
    mockRead.mockResolvedValueOnce({ resource: makeUserDoc() });
    // User replace
    mockReplace.mockResolvedValueOnce({ resource: {} });

    // Should not throw
    await expect(recordUsage("proj1", "user1", "Test User", 0.01)).resolves.toBeUndefined();
  });
});

// ── updateProjectBudget ──────────────────────────────────────────────────────

describe("updateProjectBudget", () => {
  it("reads the doc, updates budget, and replaces", async () => {
    const projDoc = makeProjectDoc({ totalBudgetUsd: 5.0 });

    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    const updatedDoc = { ...projDoc, totalBudgetUsd: 10.0 };
    mockReplace.mockResolvedValueOnce({ resource: updatedDoc });

    const result = await updateProjectBudget("proj1", 10.0, "admin");

    expect(result).not.toBeNull();
    expect(result!.totalBudgetUsd).toBe(10.0);

    // Verify replace was called with new budget
    const replaceDoc = mockReplace.mock.calls[0][2];
    expect(replaceDoc.totalBudgetUsd).toBe(10.0);
    expect(replaceDoc.updatedBy).toBe("admin");
    expect(replaceDoc.updatedAt).toBeDefined();
  });

  it("returns null when project doc is not found", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

    const result = await updateProjectBudget("proj1", 10.0, "admin");
    expect(result).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("returns null on read error", async () => {
    mockRead.mockRejectedValueOnce(new Error("Cosmos error"));

    const result = await updateProjectBudget("proj1", 10.0, "admin");
    expect(result).toBeNull();
  });

  it("returns null on replace error", async () => {
    const projDoc = makeProjectDoc();
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    mockReplace.mockRejectedValueOnce(new Error("Replace failed"));

    const result = await updateProjectBudget("proj1", 10.0, "admin");
    expect(result).toBeNull();
  });

  it("returns the doc itself when replace returns undefined resource", async () => {
    const projDoc = makeProjectDoc({ totalBudgetUsd: 5.0 });
    mockRead.mockResolvedValueOnce({ resource: { ...projDoc } });
    mockReplace.mockResolvedValueOnce({ resource: undefined });

    const result = await updateProjectBudget("proj1", 10.0, "admin");
    // Falls back to the modified resource object
    expect(result).not.toBeNull();
    expect(result!.totalBudgetUsd).toBe(10.0);
  });
});

// ── updateUserBudget ─────────────────────────────────────────────────────────

describe("updateUserBudget", () => {
  it("reads the doc, updates budget, and replaces", async () => {
    const userDoc = makeUserDoc({ totalBudgetUsd: 2.0 });

    mockRead.mockResolvedValueOnce({ resource: { ...userDoc } });
    const updatedDoc = { ...userDoc, totalBudgetUsd: 5.0 };
    mockReplace.mockResolvedValueOnce({ resource: updatedDoc });

    const result = await updateUserBudget("proj1", "user1", 5.0, "admin");

    expect(result).not.toBeNull();
    expect(result!.totalBudgetUsd).toBe(5.0);

    // Verify the item was read with correct ID
    expect(mockRead).toHaveBeenCalledWith("user_credits_user1_proj1", "proj1");

    // Verify replace was called with new budget
    const replaceDoc = mockReplace.mock.calls[0][2];
    expect(replaceDoc.totalBudgetUsd).toBe(5.0);
    expect(replaceDoc.updatedBy).toBe("admin");
  });

  it("returns null when user doc is not found", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

    const result = await updateUserBudget("proj1", "user1", 5.0, "admin");
    expect(result).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("returns null on read error", async () => {
    mockRead.mockRejectedValueOnce(new Error("Cosmos error"));

    const result = await updateUserBudget("proj1", "user1", 5.0, "admin");
    expect(result).toBeNull();
  });

  it("returns null on replace error", async () => {
    const userDoc = makeUserDoc();
    mockRead.mockResolvedValueOnce({ resource: { ...userDoc } });
    mockReplace.mockRejectedValueOnce(new Error("Replace failed"));

    const result = await updateUserBudget("proj1", "user1", 5.0, "admin");
    expect(result).toBeNull();
  });

  it("returns the doc itself when replace returns undefined resource", async () => {
    const userDoc = makeUserDoc({ totalBudgetUsd: 2.0 });
    mockRead.mockResolvedValueOnce({ resource: { ...userDoc } });
    mockReplace.mockResolvedValueOnce({ resource: undefined });

    const result = await updateUserBudget("proj1", "user1", 5.0, "admin");
    expect(result).not.toBeNull();
    expect(result!.totalBudgetUsd).toBe(5.0);
  });
});
