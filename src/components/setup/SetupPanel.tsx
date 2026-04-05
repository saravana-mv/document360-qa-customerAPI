import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { fetchProjects } from "../../lib/api/projects";
import { fetchProjectVersions } from "../../lib/api/project-versions";
import { loadSpec } from "../../lib/spec/loader";
import { parseSpec } from "../../lib/spec/parser";
import { computeFingerprint, saveFingerprint } from "../../lib/spec/fingerprint";
import type { SwaggerSpec } from "../../types/spec.types";
import { Spinner } from "../common/Spinner";

export function SetupPanel() {
  const navigate = useNavigate();
  const { token } = useAuthStore();
  const setup = useSetupStore();
  const spec = useSpecStore();
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!token) return;
    loadProjects();
  }, [token]);

  useEffect(() => {
    if (!token || !setup.selectedProjectId) return;
    loadVersions();
  }, [setup.selectedProjectId]);

  async function loadProjects() {
    setup.setLoadingProjects(true);
    try {
      const projects = await fetchProjects(token!.access_token);
      setup.setProjects(projects);
    } catch (err) {
      setup.setError(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setup.setLoadingProjects(false);
    }
  }

  async function loadVersions() {
    setup.setLoadingVersions(true);
    try {
      const versions = await fetchProjectVersions(setup.selectedProjectId, token!.access_token);
      setup.setVersions(versions);
      const def = versions.find((v) => v.isDefault);
      if (def && !setup.selectedVersionId) {
        setup.selectVersion(def.id);
      }
    } catch (err) {
      setup.setError(err instanceof Error ? err.message : "Failed to load versions");
    } finally {
      setup.setLoadingVersions(false);
    }
  }

  async function handleStart() {
    if (!setup.selectedProjectId || !setup.selectedVersionId || !setup.articleId) {
      setup.setError("Please select a project, version, and enter an article ID.");
      return;
    }
    setStarting(true);
    spec.setLoading(true);
    try {
      const rawSpec = await loadSpec();
      const swaggerSpec = rawSpec as SwaggerSpec;
      const parsedTags = parseSpec(swaggerSpec);
      const fingerprint = await computeFingerprint(swaggerSpec);
      saveFingerprint(fingerprint);
      spec.setSpec(swaggerSpec, parsedTags, fingerprint);
      navigate("/test");
    } catch (err) {
      spec.setError(err instanceof Error ? err.message : "Failed to load spec");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-lg">
        <h2 className="text-xl font-bold text-gray-900 mb-1">Test Setup</h2>
        <p className="text-sm text-gray-500 mb-6">Configure your test session</p>

        <div className="space-y-5">
          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project {setup.loadingProjects && <Spinner size="sm" className="inline text-gray-400 ml-1" />}
            </label>
            <select
              value={setup.selectedProjectId}
              onChange={(e) => setup.selectProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select a project...</option>
              {setup.projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Version */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Version {setup.loadingVersions && <Spinner size="sm" className="inline text-gray-400 ml-1" />}
            </label>
            <select
              value={setup.selectedVersionId}
              onChange={(e) => setup.selectVersion(e.target.value)}
              disabled={!setup.selectedProjectId}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            >
              <option value="">Select a version...</option>
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

          {/* Article ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Test Article ID <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={setup.articleId}
              onChange={(e) => setup.setArticleId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            <p className="text-xs text-gray-500 mt-1">UUID of an existing article in the test project (no POST /articles in spec)</p>
          </div>
        </div>

        {setup.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {setup.error}
          </div>
        )}
        {spec.error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {spec.error}
          </div>
        )}

        <button
          onClick={handleStart}
          disabled={starting || !setup.selectedProjectId || !setup.selectedVersionId || !setup.articleId}
          className="mt-6 w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {starting && <Spinner size="sm" className="text-white" />}
          {starting ? "Loading spec..." : "Start Testing"}
        </button>
      </div>
    </div>
  );
}
