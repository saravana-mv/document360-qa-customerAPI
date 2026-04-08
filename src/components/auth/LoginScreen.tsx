import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { startAuthFlow, saveOAuthConfig } from "../../lib/oauth/flow";
import { buildOAuthConfig } from "../../config/oauth";
import { Spinner } from "../common/Spinner";

export function LoginScreen() {
  const navigate = useNavigate();
  const { status, token, setConfig, setStatus } = useAuthStore();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (status === "authenticated" && token) {
      navigate("/setup");
    }
  }, [status, token, navigate]);

  async function handleLogin() {
    setError("");
    setStarting(true);
    try {
      const config = buildOAuthConfig();
      saveOAuthConfig(config);
      setConfig(config);
      setStatus("authenticating");
      await startAuthFlow(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-sm text-center">
        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <h1 className="text-xl font-bold text-gray-900 mb-1">D360 API Test Runner</h1>
        <p className="text-sm text-gray-500 mb-8">Document360 QA · Berlin environment</p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 text-left">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={starting}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Redirecting to sign in..." : "Sign in with Document360"}
        </button>

        <p className="mt-4 text-xs text-gray-400">
          Uses OAuth2 Authorization Code + PKCE
        </p>
      </div>
    </div>
  );
}
