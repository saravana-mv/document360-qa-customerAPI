import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { loadConnectionId, loadReturnPath, handleConnectionCallback } from "../../lib/oauth/flow";
import { Spinner } from "../common/Spinner";

export function OAuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Completing sign in...");
  const [failed, setFailed] = useState(false);

  const exchange = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const errorParam = params.get("error");

    if (errorParam) {
      const msg = params.get("error_description") || errorParam;
      navigate("/settings/connections?error=" + encodeURIComponent(msg));
      return;
    }

    if (!code || !state) {
      navigate("/settings/connections?error=" + encodeURIComponent("Missing code or state in callback"));
      return;
    }

    // Resolve connection ID from session storage (saved before redirect)
    const connectionId = loadConnectionId();
    if (connectionId) {
      try {
        setMessage("Exchanging authorization code...");
        const redirectUri = `${window.location.origin}/callback`;
        await handleConnectionCallback(code, state, connectionId, redirectUri);
        const returnPath = loadReturnPath();
        navigate(returnPath ?? `/settings/connections?connected=${connectionId}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[OAuthCallback] connection exchange failed:", msg);
        setFailed(true);
        setMessage(msg);
      }
      return;
    }

    // No connection ID found — redirect with error
    navigate("/settings/connections?error=" + encodeURIComponent("No connection ID found"));
  }, [navigate]);

  useEffect(() => { exchange(); }, [exchange]);

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 max-w-md px-4">
        {!failed && <Spinner size="lg" className="text-[#0969da]" />}
        {failed ? (
          <>
            <div className="bg-[#ffebe9] border border-[#ffcecb] rounded-lg p-4 text-sm text-[#d1242f] w-full">
              <p className="font-semibold mb-1">Sign-in failed</p>
              <p className="text-xs break-all">{message}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => navigate("/settings/connections")}
                className="px-4 py-2 text-xs font-medium text-[#656d76] bg-white border border-[#d1d9e0] rounded-md hover:bg-[#f6f8fa]"
              >
                Go to Connections
              </button>
              <button
                onClick={() => { setFailed(false); setMessage("Retrying..."); exchange(); }}
                className="px-4 py-2 text-xs font-medium text-white bg-[#1a7f37] rounded-md hover:bg-[#1a7f37]/90"
              >
                Retry
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-[#656d76]">{message}</p>
        )}
      </div>
    </div>
  );
}
