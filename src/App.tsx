import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { useSpecStore } from "./store/spec.store";
import { LoginScreen } from "./components/auth/LoginScreen";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import { SetupPage } from "./pages/SetupPage";
import { TestPage } from "./pages/TestPage";
import { Spinner } from "./components/common/Spinner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";

const SpecFilesPage = lazy(() => import("./pages/SpecFilesPage").then((m) => ({ default: m.SpecFilesPage })));

// Register placeholder suites (categories/drive stubs).
// Articles tests come from .flow.xml files — loaded at runtime via loadFlowsFromQueue.
import "./lib/tests/suites/categories.suite";
import "./lib/tests/suites/drive.suite";
import { loadFlowsFromQueue } from "./lib/tests/flowXml/loader";

function PageLoader() {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
      <Spinner size="lg" className="text-blue-600" />
    </div>
  );
}

function AppRoutes() {
  const { initFromSession } = useAuthStore();

  useEffect(() => {
    initFromSession();
    // Pull every queued .flow.xml, register parsed steps as runnable tests,
    // and populate the flow-status store. Idempotent.
    void loadFlowsFromQueue();

    // Global handler: any 401 from the API client means the session is stale.
    // Clear auth + loaded tests so TestExplorer falls back to the settings card.
    const onExpired = () => {
      useAuthStore.getState().logout();
      useSpecStore.getState().setSpec(null, [], null);
    };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  return (
    <Routes>
      <Route path="/" element={<LoginScreen />} />
      <Route path="/callback" element={<OAuthCallback />} />
      {/* Settings — canonical path; /setup kept for backwards compat */}
      <Route path="/settings" element={<SetupPage />} />
      <Route path="/setup" element={<Navigate to="/settings" replace />} />
      <Route path="/test" element={<TestPage />} />
      <Route path="/spec-files" element={<Suspense fallback={<PageLoader />}><SpecFilesPage /></Suspense>} />
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
