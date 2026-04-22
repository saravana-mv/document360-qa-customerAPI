import { create } from "zustand";
import { useAiCreditsStore } from "./aiCredits.store";
import { useSetupStore } from "./setup.store";

/** Trigger a background credit refresh after any AI cost is recorded. */
function refreshCredits() {
  const projectId = useSetupStore.getState().selectedProjectId;
  if (projectId) {
    useAiCreditsStore.getState().refresh(projectId);
  }
}

interface AiCostState {
  /** Persistent cost from workshopMap (ideas + batch flows) */
  workshopCostUsd: number;
  /** Ephemeral cost from ad-hoc single-flow generations (DetailPanel, etc.) */
  adhocCostUsd: number;
  /** Computed total */
  totalCostUsd: number;

  /** Set the workshop cost (recomputed from workshopMap) */
  setWorkshopCost: (cost: number) => void;
  /** Add an ad-hoc cost increment (single flow generation, title generation, etc.) */
  addAdhocCost: (cost: number) => void;
}

export const useAiCostStore = create<AiCostState>((set) => ({
  workshopCostUsd: 0,
  adhocCostUsd: 0,
  totalCostUsd: 0,

  setWorkshopCost: (cost) => {
    set((s) => ({
      workshopCostUsd: cost,
      totalCostUsd: parseFloat((cost + s.adhocCostUsd).toFixed(6)),
    }));
    refreshCredits();
  },

  addAdhocCost: (cost) => {
    set((s) => ({
      adhocCostUsd: parseFloat((s.adhocCostUsd + cost).toFixed(6)),
      totalCostUsd: parseFloat((s.workshopCostUsd + s.adhocCostUsd + cost).toFixed(6)),
    }));
    refreshCredits();
  },
}));
