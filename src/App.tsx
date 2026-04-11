import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { LoginScreen } from "./components/auth/LoginScreen";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import { SetupPage } from "./pages/SetupPage";
import { TestPage } from "./pages/TestPage";
import { Spinner } from "./components/common/Spinner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

const FlowCreatorPage = lazy(() => import("./pages/FlowCreatorPage").then((m) => ({ default: m.FlowCreatorPage })));
const SpecFilesPage = lazy(() => import("./pages/SpecFilesPage").then((m) => ({ default: m.SpecFilesPage })));

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
      {/* Settings — canonical path; /setup kept for backwards compat */}
      <Route path="/settings" element={<SetupPage />} />
      <Route path="/setup" element={<Navigate to="/settings" replace />} />
      <Route path="/test" element={<TestPage />} />
      <Route path="/flow" element={<Suspense fallback={<div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>}><FlowCreatorPage /></Suspense>} />
      <Route path="/spec-files" element={<Suspense fallback={<div className="flex-1 flex items-center justify-center"><Spinner size="lg" /></div>}><SpecFilesPage /></Suspense>} />
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
