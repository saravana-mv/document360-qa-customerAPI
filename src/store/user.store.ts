import { create } from "zustand";

export type AppRole = "owner" | "project_owner" | "qa_manager" | "qa_engineer" | "member";

export interface AppUser {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "active" | "invited" | "disabled";
}

type UserStatus = "loading" | "active" | "not_registered" | "disabled" | "dev-mode";

const ROLE_LEVEL: Record<AppRole, number> = { owner: 5, project_owner: 4, qa_manager: 3, qa_engineer: 2, member: 1 };

interface UserState {
  user: AppUser | null;
  status: UserStatus;
  /** Check the current user's registration against /api/users/me */
  check: () => Promise<void>;
  /** Returns true if the user's role is >= the given minimum. */
  hasRole: (minRole: AppRole) => boolean;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  status: "loading",

  check: async () => {
    set({ status: "loading" });
    try {
      const res = await fetch("/api/users/me");
      console.log("[user.store] /api/users/me status=%d", res.status);
      if (res.ok) {
        const data = (await res.json()) as AppUser;
        console.log("[user.store] user=%s role=%s", data.email, data.role);
        set({ user: data, status: "active" });
      } else if (res.status === 403) {
        set({ user: null, status: "not_registered" });
      } else {
        console.warn("[user.store] unexpected status %d — treating as not_registered", res.status);
        set({ user: null, status: "not_registered" });
      }
    } catch {
      // Network error — likely local dev without SWA CLI
      set({ user: null, status: "dev-mode" });
    }
  },

  hasRole: (minRole: AppRole) => {
    const { user, status } = get();
    if (status === "dev-mode") return true;
    if (!user) return false;
    return ROLE_LEVEL[user.role] >= ROLE_LEVEL[minRole];
  },
}));
