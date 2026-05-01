// Post-logout landing page. Shown after /.auth/logout redirects the user back
// to the app. Rendered outside the normal EntraGate redirect flow so the user
// doesn't get silently re-authenticated by their live Microsoft SSO cookie.

import { entraLogin } from "../../lib/entraAuth/client";

export function LoggedOutPage() {
  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center p-6">
      <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-8 w-full max-w-sm text-center">
        <div className="w-12 h-12 bg-[#1f2328] rounded-xl flex items-center justify-center mx-auto mb-5">
          <span className="text-white font-bold text-sm tracking-tight">FF</span>
        </div>
        <h3 className="text-xl font-semibold text-[#1f2328] mb-1">Signed out</h3>
        <p className="text-sm text-[#656d76] mb-8 leading-relaxed">
          You&apos;ve been signed out of FlowForge. Your Microsoft session may still be active —
          close the browser to end it fully.
        </p>
        <button
          onClick={() => entraLogin(`${window.location.origin}/`)}
          className="w-full py-2.5 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-sm font-medium rounded-md transition-colors border border-[#1f883d]/80"
        >
          Sign in again
        </button>
      </div>
    </div>
  );
}
