import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { handleCallback, loadOAuthConfig } from "../../lib/oauth/flow";
import { Spinner } from "../common/Spinner";

export function OAuthCallback() {
  const navigate = useNavigate();
  const { setToken, setError } = useAuthStore();
  const [message, setMessage] = useState("Completing sign in...");

  useEffect(() => {
    async function exchange() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const state = params.get("state");
      const errorParam = params.get("error");

      if (errorParam) {
        const msg = params.get("error_description") || errorParam;
        setError(msg);
        navigate("/?error=" + encodeURIComponent(msg));
        return;
      }

      if (!code || !state) {
        setError("Missing code or state in callback");
        navigate("/");
        return;
      }

      const config = loadOAuthConfig();
      if (!config) {
        setError("OAuth config not found — please sign in again");
        navigate("/");
        return;
      }

      try {
        setMessage("Exchanging authorization code...");
        const token = await handleCallback(code, state, config);
        setToken(token);
        navigate("/settings");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        setMessage(`Error: ${msg}`);
        setTimeout(() => navigate("/"), 3000);
      }
    }

    exchange();
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size="lg" className="text-blue-600" />
        <p className="text-sm text-gray-600">{message}</p>
      </div>
    </div>
  );
}
