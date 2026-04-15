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

export function EntraGate({ children }: { children: ReactNode }) {
  const { status, check, login } = useEntraAuthStore();

  // Kick off the session check once on mount.
  useEffect(() => {
    void check();
  }, [check]);

  // SWA reachable but no session — send the user to Entra.
  // We do this inside an effect so the redirect doesn't fire during render.
  useEffect(() => {
    if (status === "unauthenticated") {
      login();
    }
  }, [status, login]);

  if (status === "checking" || status === "unauthenticated") {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#f6f8fa] gap-3">
        <Spinner size="lg" className="text-[#0969da]" />
        <span className="text-sm text-[#656d76]">
          {status === "unauthenticated" ? "Redirecting to sign-in…" : "Verifying session…"}
        </span>
      </div>
    );
  }

  // authenticated OR dev-mode — render the app.
  return <>{children}</>;
}
