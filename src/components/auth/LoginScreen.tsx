import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

/**
 * LoginScreen is a legacy component from the D360 OAuth flow.
 * With Entra ID SSO, users are auto-authenticated — this screen
 * simply redirects to the projects page.
 */
export function LoginScreen() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate("/projects", { replace: true });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center px-4">
      <p className="text-sm text-[#656d76]">Redirecting...</p>
    </div>
  );
}
