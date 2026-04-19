import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { useSpecStore } from "./store/spec.store";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import { TestPage } from "./pages/TestPage";
import { Spinner } from "./components/common/Spinner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { EntraGate } from "./components/auth/EntraGate";
import { AccessGate } from "./components/auth/AccessGate";

const SpecFilesPage = lazy(() => import("./pages/SpecFilesPage").then((m) => ({ default: m.SpecFilesPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const SetupPanel = lazy(() => import("./components/setup/SetupPanel").then((m) => ({ default: m.SetupPanel })));
const UsersContent = lazy(() => import("./pages/UsersPage").then((m) => ({ default: m.UsersContent })));
const AuditLogContent = lazy(() => import("./pages/AuditLogPage").then((m) => ({ default: m.AuditLogContent })));

// Register placeholder suites (categories/drive stubs).
// Articles tests come from .flow.xml files — loaded at runtime via loadFlowsFromQueue.
import "./lib/tests/suites/categories.suite";
import "./lib/tests/suites/drive.suite";
import { loadFlowsFromQueue } from "./lib/tests/flowXml/loader";
import { useSetupStore } from "./store/setup.store";

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
    // Load user settings from Cosmos (migrates localStorage on first run)
    void useSetupStore.getState().loadFromServer();
    // Pull every queued .flow.xml, register parsed steps as runnable tests,
    // and populate the flow-status store. Idempotent.
    void loadFlowsFromQueue();

    // Global handler: any 401 from the API client means the session is stale.
    // Clear auth + loaded tests so TestExplorer falls back to the settings card.
    const onExpired = () => {
      console.warn("[session-expired] event fired — logging out. Stack:", new Error().stack);
      useAuthStore.getState().logout();
      useSpecStore.getState().setSpec(null, [], null);
    };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  return (
    <Routes>
      {/* Entra gate (outer) admits the user to the app. Spec Manager is the
          default landing page — D360 OAuth is only needed to run tests. */}
      <Route path="/" element={<Navigate to="/spec-files" replace />} />
      <Route path="/callback" element={<OAuthCallback />} />
      {/* Settings — nested layout with secondary LHS nav */}
      <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>}>
        <Route index element={<Suspense fallback={<PageLoader />}><SetupPanel /></Suspense>} />
        <Route path="users" element={<Suspense fallback={<PageLoader />}><UsersContent /></Suspense>} />
        <Route path="audit-log" element={<Suspense fallback={<PageLoader />}><AuditLogContent /></Suspense>} />
      </Route>
      {/* Backwards compat redirects */}
      <Route path="/setup" element={<Navigate to="/settings" replace />} />
      <Route path="/users" element={<Navigate to="/settings/users" replace />} />
      <Route path="/audit-log" element={<Navigate to="/settings/audit-log" replace />} />
      <Route path="/test" element={<TestPage />} />
      <Route path="/spec-files" element={<Suspense fallback={<PageLoader />}><SpecFilesPage /></Suspense>} />
      <Route path="*" element={<Navigate to="/spec-files" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <EntraGate>
        <AccessGate>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AccessGate>
      </EntraGate>
    </ErrorBoundary>
  );
}
