// Outer authentication gate. Blocks the whole app until the Entra ID (SWA
// EasyAuth) session has been verified. In "dev-mode" (local vite without
// SWA CLI) the gate lets everything through — no corporate login required.
//
// Flow on page load:
//   1. Render loader
//   2. Fire /.auth/me
//      → clientPrincipal set    → render children (app)
//      → clientPrincipal null   → redirect to /.auth/login/aad
//      → endpoint 404 / network → treat as dev-mode, render children

import { useEffect, type ReactNode } from "react";
import { useEntraAuthStore } from "../../store/entraAuth.store";
import { Spinner } from "../common/Spinner";
import { LoggedOutPage } from "./LoggedOutPage";

// Paths that must render WITHOUT triggering an auto-login redirect. Needed so
// the user can land on a "Signed out" page after logout without the live
// Microsoft SSO cookie silently signing them back in.
const ANONYMOUS_PATHS = new Set(["/logged-out"]);

export function EntraGate({ children }: { children: ReactNode }) {
  const { status, check, login, sessionExpired } = useEntraAuthStore();
  const isAnonymousPath = ANONYMOUS_PATHS.has(window.location.pathname);

  // Kick off the session check once on mount.
  useEffect(() => {
    void check();
  }, [check]);

  // SWA reachable but no session — send the user to Entra, UNLESS they're on
  // the logged-out page or the session expired mid-use (modal handles re-login).
  useEffect(() => {
    if (status === "unauthenticated" && !isAnonymousPath && !sessionExpired) {
      login();
    }
  }, [status, login, isAnonymousPath, sessionExpired]);

  // On the logged-out path, render the standalone page regardless of auth
  // status — this breaks the logout→auto-login loop.
  if (isAnonymousPath && status !== "checking") {
    return <LoggedOutPage />;
  }

  if (status === "checking" || (status === "unauthenticated" && !sessionExpired)) {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#f6f8fa] gap-3">
        <Spinner size="lg" className="text-[#0969da]" />
        <span className="text-sm text-[#656d76]">
          {status === "unauthenticated" ? "Redirecting to sign-in…" : "Verifying session…"}
        </span>
      </div>
    );
  }

  // authenticated, dev-mode, or session-expired (modal overlays the app) — render children.
  return <>{children}</>;
}
