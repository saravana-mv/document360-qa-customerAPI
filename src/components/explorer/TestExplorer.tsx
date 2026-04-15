import { useEffect, useState } from "react";
import { useSpecStore } from "../../store/spec.store";
import { useRunnerStore } from "../../store/runner.store";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { getAllTests, unregisterWhere } from "../../lib/tests/registry";
import { getProjectIdFromToken, fetchProject } from "../../lib/api/projects";
import { fetchProjectVersions } from "../../lib/api/project-versions";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { deactivateAll } from "../../lib/tests/flowXml/activeTests";
import { EntityNode } from "./EntityNode";
import { ProjectSettingsCard } from "../setup/ProjectSettingsCard";
import { Spinner } from "../common/Spinner";
import { startAuthFlow, loadOAuthConfig } from "../../lib/oauth/flow";
import type { ParsedTag } from "../../types/spec.types";

export function TestExplorer() {
  const { parsedTags, setSpec } = useSpecStore();
  const { selectAll, clearSelection, selectedTags } = useRunnerStore();
  const { status, token } = useAuthStore();
  const setup = useSetupStore();
  const explorerUI = useExplorerUIStore();
  // Subscribe to the flow-status store so this component re-renders once the
  // background loader finishes registering tests from blob storage. Without
  // this, a page refresh races the loader and parsedTags gets populated with
  // an empty registry.
  const flowsLoading = useFlowStatusStore((s) => s.loading);
  const flowsByName = useFlowStatusStore((s) => s.byName);
  const allTests = getAllTests();

  const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);
  const [showDeleteAll, setShowDeleteAll] = useState(false);

  // Auto-load tests as soon as we have a valid token — the project settings
  // card should only appear when the session is missing/expired.
  useEffect(() => {
    // Re-run when project or version is missing, even if parsedTags is populated.
    // Otherwise a mid-session loss of localStorage (e.g. post-logout re-sign-in)
    // leaves ctx.projectId empty and every test fails with "Path param is empty".
    if (parsedTags.length > 0 && setup.selectedProjectId && setup.selectedVersionId) return;
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

  // Keep parsedTags in sync with the registry whenever the flow-status store
  // changes (e.g. new tests created in Spec Manager). Without this, navigating
  // from Spec Manager → Test Manager can show stale data because markFlow's
  // fire-and-forget setSpec may not have run yet when the user navigated.
  //
  // MUST wait for setup.selectedProjectId to be populated before publishing
  // parsedTags — otherwise this races the auto-load effect above, cancels
  // its async project/version resolution (via the `cancelled` flag), and
  // leaves ctx.projectId empty at run time.
  useEffect(() => {
    if (flowsLoading) return;
    if (!setup.selectedProjectId) return;
    const tests = getAllTests();
    if (tests.length === 0) return;
    const built = buildParsedTagsFromRegistry();
    // Only update if the set of tags actually changed to avoid pointless re-renders
    const currentNames = parsedTags.map((t) => t.name).join("\0");
    const newNames = built.map((t) => t.name).join("\0");
    if (currentNames !== newNames) {
      setSpec(null as never, built, null as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsByName, flowsLoading, setup.selectedProjectId]);

  // Group parsedTags by test.entity (fall back to "General" if not set)
  const entityMap = new Map<string, ParsedTag[]>();
  for (const tag of parsedTags) {
    const repTest = allTests.find((t) => t.tag === tag.name);
    const entityName = repTest?.entity ?? "General";
    if (!entityMap.has(entityName)) entityMap.set(entityName, []);
    entityMap.get(entityName)!.push(tag);
  }
  const entities = Array.from(entityMap.entries());

  function handleExpandAll() {
    const entityNames = entities.map(([name]) => name);
    const tagNames = parsedTags.map((t) => t.name);
    explorerUI.expandAll(entityNames, tagNames);
  }

  function handleCollapseAll() {
    explorerUI.collapseAll();
  }

  const isAllExpanded = explorerUI.expandedEntities.size > 0 || explorerUI.expandedTags.size > 0;

  function handleDeleteAll() {
    // Unregister all xml-sourced tests (keep flow XML files in blob storage)
    unregisterWhere((def) => def.id.startsWith("xml:"));
    // Clear the active-tests set so they don't come back on refresh
    deactivateAll();
    // Clear flow status store
    const flowStatus = useFlowStatusStore.getState();
    flowStatus.pruneTo(new Set());
    // Clear selection
    clearSelection();
    // Rebuild explorer tree (will be empty)
    const built = buildParsedTagsFromRegistry();
    setSpec(null as never, built, null as never);
    setShowDeleteAll(false);
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
    if (showSpinner) {
      return (
        <div className="flex items-center justify-center h-full text-xs text-[#656d76] gap-2">
          <Spinner size="sm" className="text-[#656d76]" />
          Loading tests…
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center justify-center h-full px-6">
        <div className="w-12 h-12 rounded-full bg-[#f6f8fa] border border-[#d1d9e0] flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 0 1-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 0 1 4.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0 1 12 15a9.065 9.065 0 0 0-6.23.693L5 14.5m14.8.8 1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0 1 12 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#1f2328] mb-1">No tests yet</p>
        <p className="text-sm text-[#656d76] text-center leading-relaxed">
          Generate ideas and flows in the Spec Manager, then create tests to see them here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Title header */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-sm font-bold text-[#1f2328]">API Test Manager</span>
          <div className="flex-1" />
          <button
            onClick={() => explorerUI.setShowSettings(!explorerUI.showSettings)}
            title="Project settings"
            className={`rounded-md p-1 transition-colors ${explorerUI.showSettings ? "text-[#0969da] bg-[#ddf4ff]" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
          <button
            onClick={() => {
              const config = loadOAuthConfig();
              if (config) void startAuthFlow(config);
            }}
            title="Sign in again (refresh token)"
            className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>
        {/* Project settings (toggled via gear icon) */}
        {explorerUI.showSettings && (
          <div className="border-b border-[#d1d9e0]">
            <ProjectSettingsCard onDone={() => explorerUI.setShowSettings(false)} />
          </div>
        )}
        {/* Toolbar */}
        {(() => {
          const totalTags = parsedTags.length;
          const allTagsSelected = totalTags > 0 && selectedTags.size >= totalTags;
          return (
          <div className="flex items-center gap-2 px-3 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
            <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm font-semibold text-[#1f2328]">Tests</span>
            <div className="flex-1" />
            <button
              onClick={isAllExpanded ? handleCollapseAll : handleExpandAll}
              title={isAllExpanded ? "Collapse all" : "Expand all"}
              className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
            >
              {isAllExpanded ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5m-15 5.25l7.5-7.5 7.5 7.5" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25l-7.5 7.5-7.5-7.5m15 5.25l-7.5 7.5-7.5-7.5" />
                </svg>
              )}
            </button>
            <button
              onClick={allTagsSelected ? clearSelection : selectAll}
              title={allTagsSelected ? "Deselect all" : "Select all"}
              className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
            >
              {allTagsSelected ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => setShowDeleteAll(true)}
              title="Delete all tests"
              className="rounded-md p-1 text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </div>
          );
        })()}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {entities.map(([entityName, flows]) => (
            <EntityNode key={entityName} name={entityName} flows={flows} />
          ))}
        </div>

        {/* Delete all confirmation modal */}
        {showDeleteAll && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteAll(false)}>
            <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
                <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <span className="text-base font-semibold text-[#1f2328]">Delete all tests?</span>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-sm text-[#656d76] leading-relaxed">
                  This will unregister all <strong className="text-[#1f2328]">{parsedTags.length} test{parsedTags.length !== 1 ? "s" : ""}</strong> from the test runner.
                </p>
                <p className="text-sm text-[#656d76] leading-relaxed">
                  Flow XML files are preserved — you can recreate tests from them at any time.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
                <button
                  onClick={() => setShowDeleteAll(false)}
                  className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAll}
                  className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
                >
                  Delete all tests
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
