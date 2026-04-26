import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { lazy, Suspense, useEffect } from "react";
import { useAuthStore } from "./store/auth.store";
import { useEntraAuthStore } from "./store/entraAuth.store";
import { OAuthCallback } from "./components/auth/OAuthCallback";
import { TestPage } from "./pages/TestPage";
import { Spinner } from "./components/common/Spinner";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { EntraGate } from "./components/auth/EntraGate";
import { AccessGate } from "./components/auth/AccessGate";
import { ProjectGate } from "./components/auth/ProjectGate";
import { ProjectSelectionPage } from "./pages/ProjectSelectionPage";
import { GlobalSettingsPage } from "./pages/GlobalSettingsPage";

const SpecFilesPage = lazy(() => import("./pages/SpecFilesPage").then((m) => ({ default: m.SpecFilesPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const SetupPanel = lazy(() => import("./components/setup/SetupPanel").then((m) => ({ default: m.SetupPanel })));
const AuditLogContent = lazy(() => import("./pages/AuditLogPage").then((m) => ({ default: m.AuditLogContent })));
const ApiKeysCard = lazy(() => import("./components/setup/ApiKeysCard").then((m) => ({ default: m.ApiKeysCard })));
const MembersContent = lazy(() => import("./pages/MembersPage").then((m) => ({ default: m.MembersContent })));
const ProjectVariablesPage = lazy(() => import("./pages/ProjectVariablesPage").then((m) => ({ default: m.ProjectVariablesPage })));
const ConnectionsPage = lazy(() => import("./pages/ConnectionsPage").then((m) => ({ default: m.ConnectionsPage })));
const AiCreditsPage = lazy(() => import("./components/settings/AiCreditsPage").then((m) => ({ default: m.AiCreditsPage })));

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

/** Project-scoped routes — keyed by selectedProjectId so all pages fully
 *  remount when the user switches projects from the TopBar picker. */
function ProjectScopedRoutes() {
  const projectId = useSetupStore((s) => s.selectedProjectId);
  return (
    <div key={projectId || "__none__"} className="contents">
      <Routes>
        {/* Settings — nested layout with secondary LHS nav */}
        <Route path="/settings" element={<Suspense fallback={<PageLoader />}><SettingsPage /></Suspense>}>
          <Route index element={<Suspense fallback={<PageLoader />}><SetupPanel /></Suspense>} />
          <Route path="members" element={<Suspense fallback={<PageLoader />}><MembersContent /></Suspense>} />
          <Route path="variables" element={<Suspense fallback={<PageLoader />}><ProjectVariablesPage /></Suspense>} />
          <Route path="connections" element={<Suspense fallback={<PageLoader />}><ConnectionsPage /></Suspense>} />
          <Route path="ai-credits" element={<Suspense fallback={<PageLoader />}><AiCreditsPage /></Suspense>} />
          <Route path="api-keys" element={<Suspense fallback={<PageLoader />}><ApiKeysCard /></Suspense>} />
          <Route path="audit-log" element={<Suspense fallback={<PageLoader />}><AuditLogContent /></Suspense>} />
        </Route>
        <Route path="/test" element={<TestPage />} />
        <Route path="/spec-files" element={<Suspense fallback={<PageLoader />}><SpecFilesPage /></Suspense>} />
        {/* Fallback for project-scoped unknown paths */}
        <Route path="*" element={<Navigate to="/spec-files" replace />} />
      </Routes>
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
    // Skip if no project is selected yet (fresh Cosmos — no settings saved).
    if (useSetupStore.getState().selectedProjectId) {
      void loadFlowsFromQueue();
    }

    // Global handler: any 401 from the API client means the session is stale.
    // Re-check Entra session — if expired, EntraGate will redirect to login.
    const onExpired = () => {
      console.warn("[session-expired] event fired — re-checking Entra session");
      useAuthStore.getState().logout();
      void useEntraAuthStore.getState().check();
    };
    window.addEventListener("session-expired", onExpired);
    return () => window.removeEventListener("session-expired", onExpired);
  }, []);

  return (
    <ProjectGate>
      <Routes>
        {/* Project selection — first screen after login */}
        <Route path="/projects" element={<ProjectSelectionPage />} />
        <Route path="/global-settings" element={<GlobalSettingsPage />} />
        <Route path="/" element={<Navigate to="/projects" replace />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
        <Route path="/callback" element={<OAuthCallback />} />
        {/* Backwards compat redirects */}
        <Route path="/setup" element={<Navigate to="/settings" replace />} />
        <Route path="/users" element={<Navigate to="/settings/members" replace />} />
        <Route path="/audit-log" element={<Navigate to="/settings/audit-log" replace />} />
        {/* All project-scoped pages — keyed by projectId for full remount on switch */}
        <Route path="*" element={<ProjectScopedRoutes />} />
      </Routes>
    </ProjectGate>
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
