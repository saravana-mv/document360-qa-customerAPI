import { useEffect, useState } from "react";
import { useSpecStore } from "../../store/spec.store";
import { useRunnerStore } from "../../store/runner.store";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { getAllTests } from "../../lib/tests/registry";
import { getProjectIdFromToken, fetchProject } from "../../lib/api/projects";
import { fetchProjectVersions } from "../../lib/api/project-versions";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { EntityNode } from "./EntityNode";
import { ExplorerContext } from "./ExplorerContext";
import { ProjectSettingsCard } from "../setup/ProjectSettingsCard";
import { Spinner } from "../common/Spinner";
import type { ParsedTag } from "../../types/spec.types";

export function TestExplorer() {
  const { parsedTags, setSpec } = useSpecStore();
  const { selectAll, clearSelection } = useRunnerStore();
  const { status, token } = useAuthStore();
  const setup = useSetupStore();
  // Subscribe to the flow-status store so this component re-renders once the
  // background loader finishes registering tests from blob storage. Without
  // this, a page refresh races the loader and parsedTags gets populated with
  // an empty registry.
  const flowsLoading = useFlowStatusStore((s) => s.loading);
  const flowsByName = useFlowStatusStore((s) => s.byName);
  const allTests = getAllTests();

  const [expandSignal, setExpandSignal] = useState(1);
  const [expandAll, setExpandAll] = useState(true);
  const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Auto-load tests as soon as we have a valid token — the project settings
  // card should only appear when the session is missing/expired.
  useEffect(() => {
    if (parsedTags.length > 0) return;
    if (status !== "authenticated" || !token) return;
    // Wait for the flow loader to finish and for at least one test to be
    // registered before building the tag list. This handles the refresh race
    // where loadFlowsFromQueue() in App.tsx is still in flight.
    if (flowsLoading) return;
    if (getAllTests().length === 0) return;
    let cancelled = false;
    (async () => {
      setAutoLoading(true);
      setAutoLoadError(null);
      try {
        let projectId = setup.selectedProjectId;
        if (!projectId) {
          projectId = getProjectIdFromToken(token.access_token);
          if (!projectId) throw new Error("doc360_project_id not found in token — sign out and back in.");
          const project = await fetchProject(projectId, token.access_token);
          if (cancelled) return;
          setup.setProjects([project]);
          setup.selectProject(projectId);
        }
        let versionId = setup.selectedVersionId;
        if (!versionId) {
          const versions = await fetchProjectVersions(projectId, token.access_token);
          if (cancelled) return;
          if (versions.length === 0) throw new Error("No versions returned from API.");
          setup.setVersions(versions);
          const def = versions.find((v) => v.isDefault) ?? versions[0];
          versionId = def.id;
          setup.selectVersion(versionId);
        }
        const built = buildParsedTagsFromRegistry();
        if (cancelled) return;
        setSpec(null as never, built, null as never);
      } catch (err) {
        if (!cancelled) setAutoLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, token, parsedTags.length, flowsLoading, flowsByName]);

  function handleExpandAll() {
    setExpandAll(true);
    setExpandSignal((n) => n + 1);
  }

  function handleCollapseAll() {
    setExpandAll(false);
    setExpandSignal((n) => n + 1);
  }

  if (parsedTags.length === 0) {
    // Session expired or missing → show the settings card so user can re-auth
    // or enter project details manually.
    if (status !== "authenticated" || !token) {
      return <ProjectSettingsCard />;
    }
    if (autoLoadError) {
      return (
        <div className="p-4">
          <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-xs text-[#d1242f]">
            {autoLoadError}
          </div>
        </div>
      );
    }
    const showSpinner = autoLoading || flowsLoading;
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#656d76] gap-2">
        {showSpinner && <Spinner size="sm" className="text-[#656d76]" />}
        Loading tests…
      </div>
    );
  }

  // Group parsedTags by test.entity (fall back to "General" if not set)
  const entityMap = new Map<string, ParsedTag[]>();
  for (const tag of parsedTags) {
    const repTest = allTests.find((t) => t.tag === tag.name);
    const entityName = repTest?.entity ?? "General";
    if (!entityMap.has(entityName)) entityMap.set(entityName, []);
    entityMap.get(entityName)!.push(tag);
  }
  const entities = Array.from(entityMap.entries());

  return (
    <ExplorerContext.Provider value={{ expandSignal, expandAll }}>
      <div className="flex flex-col h-full">
        {/* Title header */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-sm font-bold text-[#1f2328]">API Test Manager</span>
        </div>
        {/* Toolbar */}
        <div className="flex items-center gap-2 px-3 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <span className="text-sm font-semibold text-[#1f2328]">Tests</span>
          <div className="flex-1" />
          <button onClick={handleExpandAll} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">Expand</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={handleCollapseAll} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">Collapse</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={selectAll} className="text-xs text-[#0969da] hover:underline">All</button>
          <span className="text-[#d1d9e0]">·</span>
          <button onClick={clearSelection} className="text-xs text-[#656d76] hover:text-[#0969da] hover:underline">None</button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {entities.map(([entityName, flows]) => (
            <EntityNode key={entityName} name={entityName} flows={flows} />
          ))}
        </div>
      </div>
    </ExplorerContext.Provider>
  );
}
