// AI credit tracking and enforcement for FlowForge.
//
// Two document types in the `ai-usage` container (partitioned by /projectId):
//   - project_credits: total budget and spend for a project
//   - user_credits:    per-user budget and spend within a project
//
// Credits are denominated in USD. Each AI call checks credits before
// calling the Anthropic API, then records actual usage afterward.

import { getAiUsageContainer } from "./cosmosClient";

// ── Default budgets (configurable by Super Owner) ───────────────────────────

const DEFAULT_PROJECT_CREDITS_USD = 5.0;
const DEFAULT_USER_CREDITS_USD = 2.0;

// ── Document shapes ─────────────────────────────────────────────────────────

export interface ProjectCreditsDoc {
  id: string;            // `credits_${projectId}`
  projectId: string;     // partition key
  type: "project_credits";
  totalBudgetUsd: number;
  usedUsd: number;
  callCount: number;
  lastUsedAt?: string;
  updatedAt: string;
  updatedBy: string;
  _etag?: string;
}

export interface UserCreditsDoc {
  id: string;            // `user_credits_${userId}_${projectId}`
  projectId: string;     // partition key
  type: "user_credits";
  userId: string;
  displayName: string;
  totalBudgetUsd: number;
  usedUsd: number;
  callCount: number;
  lastUsedAt?: string;
  updatedAt: string;
  updatedBy: string;
  _etag?: string;
}

// ── Seed credits ────────────────────────────────────────────────────────────

/** Seed project credits when a new project is created. */
export async function seedProjectCredits(
  projectId: string,
  createdBy: string,
  budgetUsd: number = DEFAULT_PROJECT_CREDITS_USD,
): Promise<void> {
  const container = await getAiUsageContainer();
  const doc: Omit<ProjectCreditsDoc, "_etag"> = {
    id: `credits_${projectId}`,
    projectId,
    type: "project_credits",
    totalBudgetUsd: budgetUsd,
    usedUsd: 0,
    callCount: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: createdBy,
  };
  await container.items.upsert(doc);
}

/** Seed user credits on their first AI call within a project. */
async function seedUserCredits(
  projectId: string,
  userId: string,
  displayName: string,
  budgetUsd: number = DEFAULT_USER_CREDITS_USD,
): Promise<UserCreditsDoc> {
  const container = await getAiUsageContainer();
  const doc: Omit<UserCreditsDoc, "_etag"> = {
    id: `user_credits_${userId}_${projectId}`,
    projectId,
    type: "user_credits",
    userId,
    displayName,
    totalBudgetUsd: budgetUsd,
    usedUsd: 0,
    callCount: 0,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
  await container.items.upsert(doc);
  return doc as UserCreditsDoc;
}

// ── Read credits ────────────────────────────────────────────────────────────

export async function getProjectCredits(projectId: string): Promise<ProjectCreditsDoc | null> {
  const container = await getAiUsageContainer();
  try {
    const { resource } = await container.item(`credits_${projectId}`, projectId).read<ProjectCreditsDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

export async function getUserCredits(userId: string, projectId: string): Promise<UserCreditsDoc | null> {
  const container = await getAiUsageContainer();
  try {
    const { resource } = await container.item(`user_credits_${userId}_${projectId}`, projectId).read<UserCreditsDoc>();
    return resource ?? null;
  } catch {
    return null;
  }
}

// ── Check credits (pre-call gate) ───────────────────────────────────────────

export interface CreditCheckResult {
  allowed: boolean;
  reason?: string;
  projectCredits?: { usedUsd: number; totalBudgetUsd: number; remainingUsd: number };
  userCredits?: { usedUsd: number; totalBudgetUsd: number; remainingUsd: number };
}

/**
 * Check whether the user/project has sufficient credits for an AI call.
 * Returns { allowed: true } if OK, or { allowed: false, reason } if exhausted.
 */
export async function checkCredits(
  projectId: string,
  userId: string,
  displayName: string,
): Promise<CreditCheckResult> {
  // Project-level check
  let projDoc = await getProjectCredits(projectId);
  if (!projDoc) {
    // Auto-seed if missing (handles projects created before credits feature)
    await seedProjectCredits(projectId, "system");
    projDoc = await getProjectCredits(projectId);
  }

  if (projDoc) {
    const remaining = projDoc.totalBudgetUsd - projDoc.usedUsd;
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: "Project AI credits exhausted",
        projectCredits: { usedUsd: projDoc.usedUsd, totalBudgetUsd: projDoc.totalBudgetUsd, remainingUsd: 0 },
      };
    }
  }

  // User-level check
  let userDoc = await getUserCredits(userId, projectId);
  if (!userDoc) {
    userDoc = await seedUserCredits(projectId, userId, displayName);
  }

  if (userDoc) {
    const remaining = userDoc.totalBudgetUsd - userDoc.usedUsd;
    if (remaining <= 0) {
      return {
        allowed: false,
        reason: "Your AI credits for this project are exhausted",
        userCredits: { usedUsd: userDoc.usedUsd, totalBudgetUsd: userDoc.totalBudgetUsd, remainingUsd: 0 },
      };
    }
  }

  return {
    allowed: true,
    projectCredits: projDoc ? {
      usedUsd: projDoc.usedUsd,
      totalBudgetUsd: projDoc.totalBudgetUsd,
      remainingUsd: projDoc.totalBudgetUsd - projDoc.usedUsd,
    } : undefined,
    userCredits: userDoc ? {
      usedUsd: userDoc.usedUsd,
      totalBudgetUsd: userDoc.totalBudgetUsd,
      remainingUsd: userDoc.totalBudgetUsd - userDoc.usedUsd,
    } : undefined,
  };
}

// ── Record usage (post-call) ────────────────────────────────────────────────

/**
 * Record AI usage cost against both project and user credit docs.
 * Uses optimistic concurrency (etag) to handle parallel calls safely.
 */
export async function recordUsage(
  projectId: string,
  userId: string,
  displayName: string,
  costUsd: number,
): Promise<void> {
  const container = await getAiUsageContainer();
  const now = new Date().toISOString();

  // ── Update project credits ──
  try {
    const { resource: projDoc } = await container
      .item(`credits_${projectId}`, projectId)
      .read<ProjectCreditsDoc>();
    if (projDoc) {
      projDoc.usedUsd = parseFloat((projDoc.usedUsd + costUsd).toFixed(6));
      projDoc.callCount += 1;
      projDoc.lastUsedAt = now;
      projDoc.updatedAt = now;
      projDoc.updatedBy = userId;
      await container.item(projDoc.id, projectId).replace(projDoc, {
        accessCondition: projDoc._etag ? { type: "IfMatch", condition: projDoc._etag } : undefined,
      });
    }
  } catch (e) {
    // Etag conflict — retry once with fresh read
    try {
      const { resource: fresh } = await container
        .item(`credits_${projectId}`, projectId)
        .read<ProjectCreditsDoc>();
      if (fresh) {
        fresh.usedUsd = parseFloat((fresh.usedUsd + costUsd).toFixed(6));
        fresh.callCount += 1;
        fresh.lastUsedAt = now;
        fresh.updatedAt = now;
        fresh.updatedBy = userId;
        await container.item(fresh.id, projectId).replace(fresh);
      }
    } catch (retryErr) {
      console.error("[aiCredits] project credit update failed:", retryErr);
    }
  }

  // ── Update user credits ──
  const userDocId = `user_credits_${userId}_${projectId}`;
  try {
    const { resource: userDoc } = await container.item(userDocId, projectId).read<UserCreditsDoc>();
    if (userDoc) {
      userDoc.usedUsd = parseFloat((userDoc.usedUsd + costUsd).toFixed(6));
      userDoc.callCount += 1;
      userDoc.lastUsedAt = now;
      userDoc.updatedAt = now;
      userDoc.updatedBy = userId;
      await container.item(userDocId, projectId).replace(userDoc, {
        accessCondition: userDoc._etag ? { type: "IfMatch", condition: userDoc._etag } : undefined,
      });
    } else {
      // Auto-seed if missing
      const seeded = await seedUserCredits(projectId, userId, displayName);
      seeded.usedUsd = costUsd;
      seeded.callCount = 1;
      seeded.lastUsedAt = now;
      await container.item(userDocId, projectId).replace(seeded);
    }
  } catch {
    // Retry once
    try {
      const { resource: fresh } = await container.item(userDocId, projectId).read<UserCreditsDoc>();
      if (fresh) {
        fresh.usedUsd = parseFloat((fresh.usedUsd + costUsd).toFixed(6));
        fresh.callCount += 1;
        fresh.lastUsedAt = now;
        fresh.updatedAt = now;
        fresh.updatedBy = userId;
        await container.item(userDocId, projectId).replace(fresh);
      }
    } catch (retryErr) {
      console.error("[aiCredits] user credit update failed:", retryErr);
    }
  }
}

// ── Update budgets (Super Owner only) ───────────────────────────────────────

export async function updateProjectBudget(
  projectId: string,
  newBudgetUsd: number,
  updatedBy: string,
): Promise<ProjectCreditsDoc | null> {
  const container = await getAiUsageContainer();
  try {
    const { resource } = await container
      .item(`credits_${projectId}`, projectId)
      .read<ProjectCreditsDoc>();
    if (!resource) return null;
    resource.totalBudgetUsd = newBudgetUsd;
    resource.updatedAt = new Date().toISOString();
    resource.updatedBy = updatedBy;
    const { resource: updated } = await container.item(resource.id, projectId).replace(resource);
    return updated ?? resource;
  } catch {
    return null;
  }
}

export async function updateUserBudget(
  projectId: string,
  userId: string,
  newBudgetUsd: number,
  updatedBy: string,
): Promise<UserCreditsDoc | null> {
  const container = await getAiUsageContainer();
  const docId = `user_credits_${userId}_${projectId}`;
  try {
    const { resource } = await container.item(docId, projectId).read<UserCreditsDoc>();
    if (!resource) return null;
    resource.totalBudgetUsd = newBudgetUsd;
    resource.updatedAt = new Date().toISOString();
    resource.updatedBy = updatedBy;
    const { resource: updated } = await container.item(docId, projectId).replace(resource);
    return updated ?? resource;
  } catch {
    return null;
  }
}
