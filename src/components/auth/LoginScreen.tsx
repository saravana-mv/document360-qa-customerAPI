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
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-8 w-full max-w-sm text-center">
        {/* Logo */}
        <div className="w-12 h-12 bg-[#1f2328] rounded-xl flex items-center justify-center mx-auto mb-5">
          <span className="text-white font-bold text-sm tracking-tight">D3</span>
        </div>

        <h1 className="text-xl font-semibold text-[#1f2328] mb-1">Sign in</h1>
        <p className="text-sm text-[#656d76] mb-8">Document360 QA · Berlin environment</p>

        {error && (
          <div className="mb-4 px-3 py-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f] text-left">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={starting}
          className="w-full py-2.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 border border-[#1a7f37]/80"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Redirecting..." : "Sign in with Document360"}
        </button>

        <p className="mt-5 text-[11px] text-[#656d76]">
          OAuth 2.0 Authorization Code + PKCE
        </p>
      </div>
    </div>
  );
}
