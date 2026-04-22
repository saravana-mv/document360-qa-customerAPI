import { create } from "zustand";

interface CreditInfo {
  totalBudgetUsd: number;
  usedUsd: number;
  remainingUsd: number;
  callCount: number;
  lastUsedAt?: string;
}

interface AiCreditsState {
  projectCredits: CreditInfo | null;
  userCredits: CreditInfo | null;
  loading: boolean;
  error: string | null;

  /** Whether AI features should be disabled (either project or user credits exhausted). */
  exhausted: boolean;

  /** Load credits from API for the current project. */
  loadCredits: (projectId: string) => Promise<void>;

  /** Refresh after an AI call completes (re-fetches from server). */
  refresh: (projectId: string) => Promise<void>;

  /** Clear credits (e.g., on project switch). */
  clear: () => void;
}

export const useAiCreditsStore = create<AiCreditsState>((set) => ({
  projectCredits: null,
  userCredits: null,
  loading: false,
  error: null,
  exhausted: false,

  loadCredits: async (projectId: string) => {
    set({ loading: true, error: null });
    try {
      const res = await fetch("/api/ai-credits", {
        headers: { "X-FlowForge-ProjectId": projectId },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { project: CreditInfo | null; user: CreditInfo | null };
      const projectExhausted = data.project ? data.project.remainingUsd <= 0 : false;
      const userExhausted = data.user ? data.user.remainingUsd <= 0 : false;
      set({
        projectCredits: data.project,
        userCredits: data.user,
        exhausted: projectExhausted || userExhausted,
        loading: false,
      });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  refresh: async (projectId: string) => {
    // Silent refresh — don't set loading state
    try {
      const res = await fetch("/api/ai-credits", {
        headers: { "X-FlowForge-ProjectId": projectId },
      });
      if (!res.ok) return;
      const data = (await res.json()) as { project: CreditInfo | null; user: CreditInfo | null };
      const projectExhausted = data.project ? data.project.remainingUsd <= 0 : false;
      const userExhausted = data.user ? data.user.remainingUsd <= 0 : false;
      set({
        projectCredits: data.project,
        userCredits: data.user,
        exhausted: projectExhausted || userExhausted,
      });
    } catch { /* silent */ }
  },

  clear: () => set({ projectCredits: null, userCredits: null, exhausted: false, loading: false, error: null }),
}));
