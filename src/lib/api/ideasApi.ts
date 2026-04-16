// Server-backed ideas API. Replaces localStorage-based workshop map in SpecFilesPage.
// Each folder's ideas are stored as a separate Cosmos document.

import { getProjectHeaders } from "./projectHeader";
import type { FlowIdea, FlowIdeasUsage, FlowUsage } from "./specFilesApi";
import type { GeneratedFlow } from "../../components/specfiles/FlowsPanel";

export interface ContextData {
  ideas: FlowIdea[];
  usage: FlowIdeasUsage | null;
  flowsUsage: FlowUsage | null;
  generatedFlows: GeneratedFlow[];
}

export type WorkshopMap = Record<string, ContextData>;

const EMPTY_CONTEXT: ContextData = { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] };

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

/** Fetch ideas for a single folder path */
export async function getIdeasForFolder(folderPath: string): Promise<ContextData> {
  const res = await apiFetch(`/api/ideas?folderPath=${encodeURIComponent(folderPath)}`);
  const data = await res.json() as ContextData;
  return {
    ideas: data.ideas ?? [],
    usage: data.usage ?? null,
    flowsUsage: data.flowsUsage ?? null,
    generatedFlows: (data.generatedFlows ?? []) as GeneratedFlow[],
  };
}

/** Fetch all ideas under a prefix (for aggregation) — returns WorkshopMap */
export async function getIdeasByPrefix(prefix: string): Promise<WorkshopMap> {
  const res = await apiFetch(`/api/ideas?prefix=${encodeURIComponent(prefix)}`);
  return res.json() as Promise<WorkshopMap>;
}

/** Fetch all ideas for the current project — returns full WorkshopMap */
export async function getAllIdeas(): Promise<WorkshopMap> {
  const res = await apiFetch("/api/ideas");
  return res.json() as Promise<WorkshopMap>;
}

/** Save ideas for a single folder */
export async function saveIdeas(folderPath: string, data: ContextData): Promise<void> {
  await apiFetch("/api/ideas", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      folderPath,
      ideas: data.ideas,
      usage: data.usage,
      flowsUsage: data.flowsUsage,
      generatedFlows: data.generatedFlows,
    }),
  });
}

/** Delete ideas for a folder */
export async function deleteIdeas(folderPath: string): Promise<void> {
  await apiFetch(`/api/ideas?folderPath=${encodeURIComponent(folderPath)}`, { method: "DELETE" });
}

/** Aggregate ideas from a map for a given path + descendants */
export function aggregateForPath(map: WorkshopMap, path: string | null): ContextData {
  if (!path) return EMPTY_CONTEXT;
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const matchingKeys = Object.keys(map).filter(k => k === path || k.startsWith(prefix));

  if (matchingKeys.length === 0) return EMPTY_CONTEXT;
  if (matchingKeys.length === 1) {
    const ctx = map[matchingKeys[0]];
    return { ...ctx, flowsUsage: ctx.flowsUsage ?? null };
  }

  const allIdeas: FlowIdea[] = [];
  const allFlows: GeneratedFlow[] = [];
  let totalUsage: FlowIdeasUsage | null = null;
  let totalFlowsUsage: FlowUsage | null = null;

  for (const key of matchingKeys) {
    const ctx = map[key];
    allIdeas.push(...ctx.ideas);
    allFlows.push(...ctx.generatedFlows);
    if (ctx.usage) {
      if (!totalUsage) {
        totalUsage = { ...ctx.usage };
      } else {
        totalUsage = {
          inputTokens: totalUsage.inputTokens + ctx.usage.inputTokens,
          outputTokens: totalUsage.outputTokens + ctx.usage.outputTokens,
          totalTokens: totalUsage.totalTokens + ctx.usage.totalTokens,
          costUsd: parseFloat((totalUsage.costUsd + ctx.usage.costUsd).toFixed(6)),
          filesAnalyzed: totalUsage.filesAnalyzed + ctx.usage.filesAnalyzed,
          totalSpecCharacters: totalUsage.totalSpecCharacters + ctx.usage.totalSpecCharacters,
        };
      }
    }
    if (ctx.flowsUsage) {
      if (!totalFlowsUsage) {
        totalFlowsUsage = { ...ctx.flowsUsage };
      } else {
        totalFlowsUsage = {
          inputTokens: totalFlowsUsage.inputTokens + ctx.flowsUsage.inputTokens,
          outputTokens: totalFlowsUsage.outputTokens + ctx.flowsUsage.outputTokens,
          totalTokens: totalFlowsUsage.totalTokens + ctx.flowsUsage.totalTokens,
          costUsd: parseFloat((totalFlowsUsage.costUsd + ctx.flowsUsage.costUsd).toFixed(6)),
        };
      }
    }
  }

  return { ideas: allIdeas, usage: totalUsage, flowsUsage: totalFlowsUsage, generatedFlows: allFlows };
}

/** Get next globally unique idea index across all contexts */
export function nextGlobalIdeaIndex(map: WorkshopMap): number {
  let max = 0;
  for (const ctx of Object.values(map)) {
    for (const idea of ctx.ideas) {
      const match = idea.id.match(/^idea-(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1]));
    }
  }
  return max + 1;
}

/**
 * Client-side migration: if localStorage still has the old workshop key,
 * push each folder's ideas to the server, then delete the key.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  const STORAGE_KEY_V2 = "specfiles_workshop_v2";
  const STORAGE_KEY_V1 = "specfiles_workshop";
  try {
    let raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      raw = localStorage.getItem(STORAGE_KEY_V1);
      if (!raw) return;
    }
    const map = JSON.parse(raw) as WorkshopMap;
    const entries = Object.entries(map);
    if (entries.length === 0) return;

    for (const [folderPath, data] of entries) {
      await saveIdeas(folderPath, data);
    }

    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_V1);
    console.log(`[ideasApi] Migrated ${entries.length} idea folders from localStorage`);
  } catch (e) {
    console.warn("[ideasApi] Migration from localStorage failed:", e);
  }
}
