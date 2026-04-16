// App-level access gate. Sits between EntraGate and the router.
// After Entra SSO succeeds, checks if the user is registered in FlowForge.
// If not registered → shows an "access denied" screen.
// In dev-mode (local vite without SWA) → passes through.

import { useEffect, type ReactNode } from "react";
import { useUserStore } from "../../store/user.store";
import { useEntraAuthStore } from "../../store/entraAuth.store";
import { Spinner } from "../common/Spinner";

export function AccessGate({ children }: { children: ReactNode }) {
  const entraStatus = useEntraAuthStore((s) => s.status);
  const { status, check } = useUserStore();

  useEffect(() => {
    // Only check registration after Entra auth is confirmed
    if (entraStatus === "authenticated") {
      void check();
    }
    if (entraStatus === "dev-mode") {
      useUserStore.setState({ status: "dev-mode" });
    }
  }, [entraStatus, check]);

  // While Entra is still checking, let EntraGate handle the UI
  if (entraStatus === "checking" || entraStatus === "unauthenticated") {
    return <>{children}</>;
  }

  // Dev-mode — pass through
  if (entraStatus === "dev-mode" || status === "dev-mode") {
    return <>{children}</>;
  }

  // Loading user registration
  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center h-screen w-screen bg-[#f6f8fa] gap-3">
        <Spinner size="lg" className="text-[#0969da]" />
        <span className="text-sm text-[#656d76]">Checking access…</span>
      </div>
    );
  }

  // Not registered — show access denied
  if (status === "not_registered") {
    const principal = useEntraAuthStore.getState().principal;
    return (
      <div className="flex items-center justify-center h-screen w-screen bg-[#f6f8fa]">
        <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-8 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-[#ffebe9] rounded-xl flex items-center justify-center mx-auto mb-5">
            <svg className="w-6 h-6 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h3 className="text-xl font-semibold text-[#1f2328] mb-1">Access Required</h3>
          <p className="text-sm text-[#656d76] mb-4 leading-relaxed">
            You are signed in as <strong className="text-[#1f2328]">{principal?.userDetails ?? "Unknown"}</strong> but you don&apos;t have access to FlowForge yet.
          </p>
          <p className="text-sm text-[#656d76] leading-relaxed">
            Ask an Owner to invite you from the Users page.
          </p>
          <button
            onClick={() => { window.location.href = "/.auth/logout?post_logout_redirect_uri=/logged-out"; }}
            className="mt-6 w-full py-2 bg-white hover:bg-[#f6f8fa] text-[#1f2328] text-sm font-medium rounded-md transition-colors border border-[#d1d9e0]"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Active — render app
  return <>{children}</>;
}
