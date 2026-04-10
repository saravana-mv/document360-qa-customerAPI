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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Test Setup</h2>
        <p className="text-sm text-gray-500 mb-6">Configure your test session</p>

        <div className="space-y-5">

          {/* ── Environment ───────────────────────────────────── */}
          <div className="pb-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Environment</p>
            <div className="space-y-3">
              {/* Base URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base URL</label>
                <input
                  type="url"
                  value={setup.baseUrl}
                  onChange={(e) => setup.setBaseUrl(e.target.value)}
                  placeholder="https://apihub.berlin.document360.net"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                />
              </div>

              {/* API Version */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">API Version</label>
                <select
                  value={setup.apiVersion}
                  onChange={(e) => setup.setApiVersion(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {API_VERSIONS.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Used for article endpoints. Category endpoints always use v2.
                </p>
              </div>
            </div>
          </div>

          {/* ── Project ───────────────────────────────────────── */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project {setup.loadingProjects && <Spinner size="sm" className="inline text-gray-400 ml-1" />}
            </label>
            <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600 flex items-center justify-between">
              {project ? (
                <span>{project.name}</span>
              ) : (
                <span className="text-gray-400">{setup.loadingProjects ? "Detecting..." : "Not detected"}</span>
              )}
              {project && <span className="text-xs text-gray-400 font-mono">{project.id.slice(0, 8)}…</span>}
            </div>
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version {setup.loadingVersions && <Spinner size="sm" className="inline text-gray-400 ml-1" />}
            </label>
            <select
              value={setup.selectedVersionId}
              onChange={(e) => setup.selectVersion(e.target.value)}
              disabled={setup.versions.length === 0}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-400"
            >
              <option value="">{setup.loadingVersions ? "Loading..." : setup.versions.length === 0 ? "No versions found" : "Select a version..."}</option>
              {setup.versions.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Language */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Language Code</label>
            <input
              type="text"
              value={setup.langCode}
              onChange={(e) => setup.setLangCode(e.target.value)}
              placeholder="en"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

        </div>

        {setup.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {setup.error}
            <button onClick={initProjectAndVersions} className="ml-3 underline text-red-600 hover:text-red-800">Retry</button>
          </div>
        )}
        {spec.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {spec.error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting || !setup.selectedProjectId || !setup.selectedVersionId}
          className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Loading..." : "Start Testing"}
        </button>
      </div>
    </div>
  );
}
