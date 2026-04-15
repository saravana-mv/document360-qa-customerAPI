// Compact project-settings form used in the Test Manager LHS sidebar as the
// empty state (shown when no spec has been loaded yet). Scope is intentionally
// narrower than the full SetupPanel — only project-scoped fields, no
// Environment or Application settings.

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { getProjectIdFromToken, fetchProject } from "../../lib/api/projects";
import { fetchProjectVersions } from "../../lib/api/project-versions";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { startAuthFlow, saveOAuthConfig } from "../../lib/oauth/flow";
import { buildOAuthConfig } from "../../config/oauth";
import { Spinner } from "../common/Spinner";

interface ProjectSettingsCardProps {
  /** When provided, called after "Start testing" succeeds instead of navigating. */
  onDone?: () => void;
}

export function ProjectSettingsCard({ onDone }: ProjectSettingsCardProps = {}) {
  const navigate = useNavigate();
  const { token, setConfig, setStatus } = useAuthStore();
  const setup = useSetupStore();
  const spec = useSpecStore();
  const [starting, setStarting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  async function handleD360SignIn() {
    setSigningIn(true);
    try {
      const config = buildOAuthConfig();
      saveOAuthConfig(config);
      setConfig(config);
      setStatus("authenticating");
      await startAuthFlow(config);
    } catch (err) {
      spec.setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
      setSigningIn(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    if (setup.projects.length > 0 && setup.versions.length > 0) return;
    initProjectAndVersions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function initProjectAndVersions() {
    setup.setError(null);
    setup.setLoadingProjects(true);

    let projectId = "";
    try {
      projectId = getProjectIdFromToken(token!.access_token);
      if (!projectId) throw new Error("doc360_project_id not found in token — try signing out and back in.");
      const project = await fetchProject(projectId, token!.access_token);
      setup.setProjects([project]);
      setup.selectProject(projectId);
    } catch (err) {
      setup.setError(err instanceof Error ? err.message : "Failed to load project");
      setup.setLoadingProjects(false);
      return;
    } finally {
      setup.setLoadingProjects(false);
    }

    setup.setLoadingVersions(true);
    try {
      const versions = await fetchProjectVersions(projectId, token!.access_token);
      if (versions.length === 0) {
        setup.setError("No versions returned from API.");
        return;
      }
      setup.setVersions(versions);
      const def = versions.find((v) => v.isDefault) ?? versions[0];
      if (def) setup.selectVersion(def.id);
    } catch (err) {
      setup.setError(`Failed to load versions: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setup.setLoadingVersions(false);
    }
  }

  async function handleStart() {
    if (!setup.selectedProjectId || !setup.selectedVersionId) {
      setup.setError("Please select a project version.");
      return;
    }
    setStarting(true);
    try {
      const parsedTags = buildParsedTagsFromRegistry();
      spec.setSpec(null as never, parsedTags, null as never);
      if (onDone) {
        onDone();
      } else {
        navigate("/test");
      }
    } catch (err) {
      spec.setError(err instanceof Error ? err.message : "Failed to initialise tests");
    } finally {
      setStarting(false);
    }
  }

  const project = setup.projects[0];

  // Not signed in to Document360 yet — show an inline sign-in prompt.
  // Running tests (but not browsing specs/settings) requires a D360 token.
  if (!token) {
    return (
      <div className="flex flex-col h-full overflow-y-auto p-3">
        <div className="bg-white rounded-md border border-[#d1d9e0] p-4 text-center">
          <h3 className="text-sm font-semibold text-[#1f2328] mb-1">Connect to Document360</h3>
          <p className="text-xs text-[#656d76] mb-4 leading-relaxed">
            Sign in to Document360 to load your project and run tests. Spec Manager and Settings don&apos;t require this.
          </p>
          <button
            onClick={handleD360SignIn}
            disabled={signingIn}
            className="w-full py-2 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-60 border border-[#1a7f37]/80"
          >
            {signingIn && <Spinner size="sm" className="text-white" />}
            {signingIn ? "Redirecting…" : "Sign in to Document360"}
          </button>
          <p className="mt-3 text-[11px] text-[#656d76]">OAuth 2.0 Authorization Code + PKCE</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto p-3">
      <div className="bg-white rounded-md border border-[#d1d9e0] p-4">
        <h3 className="text-sm font-semibold text-[#1f2328] mb-0.5">Project settings</h3>
        <p className="text-xs text-[#656d76] mb-4">Select a project version to load tests.</p>

        <div className="space-y-3">
          {/* Project */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#1f2328] mb-1">
              Project
              {setup.loadingProjects && <Spinner size="sm" className="text-[#656d76]" />}
            </label>
            <div className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-[#f6f8fa] text-[#1f2328] flex items-center justify-between">
              {project ? (
                <span className="truncate">{project.name}</span>
              ) : (
                <span className="text-[#afb8c1]">{setup.loadingProjects ? "Detecting…" : "Not detected"}</span>
              )}
            </div>
          </div>

          {/* Version */}
          <div>
            <label className="flex items-center gap-1.5 text-xs font-medium text-[#1f2328] mb-1">
              Version
              {setup.loadingVersions && <Spinner size="sm" className="text-[#656d76]" />}
            </label>
            <select
              value={setup.selectedVersionId}
              onChange={(e) => setup.selectVersion(e.target.value)}
              disabled={setup.versions.length === 0}
              className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-[#f6f8fa] focus:bg-white text-[#1f2328] disabled:text-[#afb8c1]"
            >
              <option value="">{setup.loadingVersions ? "Loading…" : setup.versions.length === 0 ? "No versions" : "Select…"}</option>
              {setup.versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-xs font-medium text-[#1f2328] mb-1">Language Code</label>
            <input
              type="text"
              value={setup.langCode}
              onChange={(e) => setup.setLangCode(e.target.value)}
              placeholder="en"
              className="w-full px-2.5 py-1.5 border border-[#d1d9e0] rounded-md text-xs bg-[#f6f8fa] focus:bg-white text-[#1f2328] placeholder:text-[#afb8c1]"
            />
          </div>

        </div>

        {setup.error && (
          <div className="mt-3 px-2.5 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {setup.error}
            <button onClick={initProjectAndVersions} className="ml-2 underline text-[#d1242f] hover:text-[#a40e26] font-medium">Retry</button>
          </div>
        )}
        {spec.error && (
          <div className="mt-3 px-2.5 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {spec.error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting || !setup.selectedProjectId || !setup.selectedVersionId}
          className="mt-4 w-full py-2 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 border border-[#1a7f37]/80"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Loading…" : "Start testing"}
        </button>
      </div>
    </div>
  );
}
