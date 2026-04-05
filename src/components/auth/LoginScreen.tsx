import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { startAuthFlow, saveOAuthConfig, loadOAuthConfig } from "../../lib/oauth/flow";
import type { OAuthConfig } from "../../types/auth.types";
import { Spinner } from "../common/Spinner";

export function LoginScreen() {
  const navigate = useNavigate();
  const { status, token, setConfig, setStatus } = useAuthStore();
  const [form, setForm] = useState<OAuthConfig>({
    clientId: "",
    authorizationUrl: "",
    tokenUrl: "",
    scope: "openid profile email",
    redirectUri: "",
  });
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Auto-fill redirectUri
    setForm((f) => ({ ...f, redirectUri: `${window.location.origin}/callback` }));

    // Load saved config
    const saved = loadOAuthConfig();
    if (saved) {
      setForm((_prev) => ({ ...saved, redirectUri: `${window.location.origin}/callback` }));
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && token) {
      navigate("/setup");
    }
  }, [status, token, navigate]);

  async function handleLogin() {
    if (!form.clientId || !form.authorizationUrl || !form.tokenUrl) {
      setError("Client ID, Authorization URL, and Token URL are required.");
      return;
    }
    setError("");
    setStarting(true);
    try {
      saveOAuthConfig(form);
      setConfig(form);
      setStatus("authenticating");
      await startAuthFlow(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      setStarting(false);
    }
  }

  const field = (label: string, key: keyof OAuthConfig, placeholder?: string, type = "text") => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">D360 API Test Runner</h1>
        <p className="text-sm text-gray-500 mb-6">Sign in with OAuth2 to begin testing</p>

        <div className="space-y-4">
          {field("Client ID", "clientId", "your-client-id")}
          {field("Authorization URL", "authorizationUrl", "https://auth.example.com/authorize")}
          {field("Token URL", "tokenUrl", "https://auth.example.com/token")}
          {field("Scope", "scope", "openid profile")}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Redirect URI (auto)</label>
            <input
              type="text"
              value={form.redirectUri}
              readOnly
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-500"
            />
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={starting}
          className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Redirecting..." : "Sign in with OAuth2"}
        </button>
      </div>
    </div>
  );
}
