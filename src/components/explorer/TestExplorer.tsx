import { useEffect, useState } from "react";
import { useSpecStore } from "../../store/spec.store";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { getAllTests } from "../../lib/tests/registry";
import { getProjectIdFromToken, fetchProject } from "../../lib/api/projects";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { VersionAccordion } from "./VersionAccordion";
import { ProjectSettingsCard } from "../setup/ProjectSettingsCard";
import { Spinner } from "../common/Spinner";
import { startAuthFlow, loadOAuthConfig } from "../../lib/oauth/flow";
import type { ParsedTag } from "../../types/spec.types";

export function TestExplorer() {
  const { parsedTags, setSpec } = useSpecStore();
  const { status, token } = useAuthStore();
  const setup = useSetupStore();
  const explorerUI = useExplorerUIStore();
  const orgLoaded = useScenarioOrgStore((s) => s.loaded);
  const orgLoading = useScenarioOrgStore((s) => s.loading);
  const orgLoad = useScenarioOrgStore((s) => s.load);
  const flowsLoading = useFlowStatusStore((s) => s.loading);
  const flowsByName = useFlowStatusStore((s) => s.byName);
  const allTests = getAllTests();

  const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Auto-load scenarios once we have a valid token AND the user has already
  // saved project settings (version selected).
  useEffect(() => {
    if (parsedTags.length > 0 && setup.selectedProjectId && setup.selectedVersionId) return;
    if (status !== "authenticated" || !token) return;
    if (!setup.settingsConfirmed) return;
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

  // Keep parsedTags in sync with the registry whenever the flow-status store changes
  useEffect(() => {
    if (flowsLoading) return;
    if (!setup.selectedProjectId) return;
    const tests = getAllTests();
    if (tests.length === 0) return;
    const built = buildParsedTagsFromRegistry();
    const currentNames = parsedTags.map((t) => t.name).join("\0");
    const newNames = built.map((t) => t.name).join("\0");
    if (currentNames !== newNames) {
      setSpec(null as never, built, null as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsByName, flowsLoading, setup.selectedProjectId]);

  // Load scenario org once tests are available
  useEffect(() => {
    if (!orgLoaded && !orgLoading && parsedTags.length > 0) {
      orgLoad();
    }
  }, [parsedTags.length, orgLoaded, orgLoading, orgLoad]);

  // Group scenarios by version
  const sortOrder = explorerUI.sortOrder;
  const cmp = sortOrder === "asc"
    ? (a: string, b: string) => a.localeCompare(b)
    : (a: string, b: string) => b.localeCompare(a);

  // Build version → tags mapping (pure derivation, no store method calls)
  const versionTagsMap = new Map<string, ParsedTag[]>();
  for (const tag of parsedTags) {
    const repTest = allTests.find((t) => t.tag === tag.name);
    const flowFileName = repTest?.flowFileName;
    if (!flowFileName) {
      if (!versionTagsMap.has("other")) versionTagsMap.set("other", []);
      versionTagsMap.get("other")!.push(tag);
      continue;
    }
    // Extract version from flow path prefix (e.g. "v3/Articles/foo.flow.xml" → "v3")
    const slashIdx = flowFileName.indexOf("/");
    const v = slashIdx > 0 ? flowFileName.slice(0, slashIdx) : "other";
    if (!versionTagsMap.has(v)) versionTagsMap.set(v, []);
    versionTagsMap.get(v)!.push(tag);
  }

  // Sort versions: descending (v3 before v2), "other" last
  const versions = Array.from(versionTagsMap.entries())
    .sort(([a], [b]) => {
      if (a === "other") return 1;
      if (b === "other") return -1;
      return b.localeCompare(a);
    })
    .map(([version, tags]) => ({
      version,
      tags: [...tags].sort((a, b) => cmp(a.name, b.name)),
    }));

  // Auth gate
  if (status !== "authenticated" || !token) {
    return <ProjectSettingsCard />;
  }

  // Settings gate
  if (!setup.settingsConfirmed) {
    return <ProjectSettingsCard />;
  }

  if (parsedTags.length === 0) {
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
          Loading scenarios…
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
        <p className="text-sm font-medium text-[#1f2328] mb-1">No scenarios yet</p>
        <p className="text-sm text-[#656d76] text-center leading-relaxed">
          Generate ideas and flows in the Spec Manager, then create scenarios to see them here.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Title header */}
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <span className="text-sm font-bold text-[#1f2328]">API Scenario Manager</span>
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
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
          {versions.map(({ version, tags: vTags }) => (
            <VersionAccordion
              key={version}
              version={version}
              tags={vTags}
              scenarioCount={vTags.length}
              sortOrder={sortOrder}
            />
          ))}
        </div>
      </div>
    </>
  );
}
