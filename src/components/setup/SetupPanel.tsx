import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { getProjectIdFromToken, fetchProject } from "../../lib/api/projects";
import { fetchProjectVersions } from "../../lib/api/project-versions";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { Spinner } from "../common/Spinner";

const API_VERSIONS = ["v3", "v2"];

export function SetupPanel() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const setup = useSetupStore();
  const spec = useSpecStore();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token) return;
    initProjectAndVersions();
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
      navigate("/test");
    } catch (err) {
      spec.setError(err instanceof Error ? err.message : "Failed to initialise tests");
    } finally {
      setStarting(false);
    }
  }

  const project = setup.projects[0];

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-center justify-center px-4">
      <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6 w-full max-w-md">
        <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">Configure test session</h2>
        <p className="text-sm text-[#656d76] mb-5">Select your project and environment settings.</p>

        <div className="space-y-4">

          {/* ── Environment ───────────────────────────────────── */}
          <fieldset className="pb-4 border-b border-[#d1d9e0]">
            <legend className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-3">Environment</legend>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-[#1f2328] mb-1">Base URL</label>
                <input
                  type="url"
                  value={setup.baseUrl}
                  onChange={(e) => setup.setBaseUrl(e.target.value)}
                  placeholder="https://apihub.berlin.document360.net"
                  className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white font-mono text-[#1f2328] placeholder:text-[#afb8c1]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1f2328] mb-1">API Version</label>
                <select
                  value={setup.apiVersion}
                  onChange={(e) => setup.setApiVersion(e.target.value)}
                  className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
                >
                  {API_VERSIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <p className="text-[11px] text-[#656d76] mt-1">
                  Article endpoints use selected version. Category endpoints always use v2.
                </p>
              </div>
            </div>
          </fieldset>

          {/* ── Project ───────────────────────────────────────── */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[#1f2328] mb-1">
              Project
              {setup.loadingProjects && <Spinner size="sm" className="text-[#656d76]" />}
            </label>
            <div className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] text-[#1f2328] flex items-center justify-between">
              {project ? (
                <span>{project.name}</span>
              ) : (
                <span className="text-[#afb8c1]">{setup.loadingProjects ? "Detecting..." : "Not detected"}</span>
              )}
              {project && <span className="text-[11px] text-[#656d76] font-mono">{project.id.slice(0, 8)}…</span>}
            </div>
          </div>

          {/* Version */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium text-[#1f2328] mb-1">
              Version
              {setup.loadingVersions && <Spinner size="sm" className="text-[#656d76]" />}
            </label>
            <select
              value={setup.selectedVersionId}
              onChange={(e) => setup.selectVersion(e.target.value)}
              disabled={setup.versions.length === 0}
              className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] disabled:text-[#afb8c1]"
            >
              <option value="">{setup.loadingVersions ? "Loading..." : setup.versions.length === 0 ? "No versions found" : "Select a version..."}</option>
              {setup.versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-[#1f2328] mb-1">Language Code</label>
            <input
              type="text"
              value={setup.langCode}
              onChange={(e) => setup.setLangCode(e.target.value)}
              placeholder="en"
              className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] placeholder:text-[#afb8c1]"
            />
          </div>

        </div>

        {setup.error && (
          <div className="mt-4 px-3 py-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
            {setup.error}
            <button onClick={initProjectAndVersions} className="ml-3 underline text-[#d1242f] hover:text-[#a40e26] font-medium">Retry</button>
          </div>
        )}
        {spec.error && (
          <div className="mt-4 px-3 py-2.5 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
            {spec.error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting || !setup.selectedProjectId || !setup.selectedVersionId}
          className="mt-5 w-full py-2.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-sm font-medium rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50 border border-[#1a7f37]/80"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Loading..." : "Start testing"}
        </button>
      </div>
    </div>
  );
}
