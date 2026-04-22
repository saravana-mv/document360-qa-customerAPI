// Project selection gate. Sits inside the BrowserRouter.
// If no project is selected, redirects to /projects.
// The /projects route itself is exempt from this gate.

import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSetupStore } from "../../store/setup.store";
import { useEntraAuthStore } from "../../store/entraAuth.store";

/** Paths that do NOT require a selected project. */
const EXEMPT_PATHS = new Set(["/projects", "/global-settings", "/callback", "/logged-out"]);

export function ProjectGate({ children }: { children: ReactNode }) {
  const selectedProjectId = useSetupStore((s) => s.selectedProjectId);
  const entraStatus = useEntraAuthStore((s) => s.status);
  const location = useLocation();

  // Dev-mode — pass through (no enforcement)
  if (entraStatus === "dev-mode") return <>{children}</>;

  // Exempt paths render without a project
  if (EXEMPT_PATHS.has(location.pathname)) return <>{children}</>;

  // No project selected — redirect to project selection
  if (!selectedProjectId) {
    return <Navigate to="/projects" replace />;
  }

  return <>{children}</>;
}
