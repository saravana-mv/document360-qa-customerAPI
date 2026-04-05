import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { LoginScreen } from "./components/auth/LoginScreen";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import { SetupPage } from "./pages/SetupPage";
import { TestPage } from "./pages/TestPage";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

// Register all test suites (side-effect imports)
import "./lib/tests/suites/articles.suite";
import "./lib/tests/suites/categories.suite";
import "./lib/tests/suites/drive.suite";

function AppRoutes() {
  const { initFromSession } = useAuthStore();

  useEffect(() => {
    initFromSession();
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/callback" element={<OAuthCallback />} />
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/test" element={<TestPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
