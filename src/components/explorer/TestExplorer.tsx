import { useEffect, useState } from "react";
import { useSpecStore } from "../../store/spec.store";
import { useSetupStore } from "../../store/setup.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { getAllTests } from "../../lib/tests/registry";
import { fetchProject } from "../../lib/api/projects";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { VersionAccordion } from "./VersionAccordion";
import { Spinner } from "../common/Spinner";
import type { ParsedTag } from "../../types/spec.types";

export function TestExplorer() {
  const { parsedTags, setSpec } = useSpecStore();
  const setup = useSetupStore();
  const sortOrder = useExplorerUIStore((s) => s.sortOrder);
  const orgLoaded = useScenarioOrgStore((s) => s.loaded);
  const orgLoading = useScenarioOrgStore((s) => s.loading);
  const orgLoad = useScenarioOrgStore((s) => s.load);
  const flowsLoading = useFlowStatusStore((s) => s.loading);
  const flowsByName = useFlowStatusStore((s) => s.byName);
  const allTests = getAllTests();

  const [autoLoadError, setAutoLoadError] = useState<string | null>(null);
  const [autoLoading, setAutoLoading] = useState(false);

  // Build parsedTags from registry whenever flows change.
  useEffect(() => {
    if (flowsLoading) return;
    const tests = getAllTests();
    if (tests.length === 0) return;
    const built = buildParsedTagsFromRegistry();
    const currentNames = parsedTags.map((t) => t.name).join("\0");
    const newNames = built.map((t) => t.name).join("\0");
    if (currentNames !== newNames) {
      setSpec(null as never, built, null as never);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsByName, flowsLoading]);

  // Auto-load project info if project not yet loaded
  useEffect(() => {
    if (!setup.selectedProjectId) return;
    if (setup.selectedProjectId && setup.projects.length > 0) return;
    if (flowsLoading) return;
    let cancelled = false;
    (async () => {
      setAutoLoading(true);
      setAutoLoadError(null);
      try {
        const projectId = setup.selectedProjectId;
        if (!projectId) {
          // No project selected — user needs to pick one from the project selection page
          setAutoLoading(false);
          return;
        }
        const project = await fetchProject(projectId, "proxied");
        if (cancelled) return;
        setup.setProjects([project]);
      } catch (err) {
        if (!cancelled) setAutoLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowsLoading]);

  // Load scenario org once tests are available
  useEffect(() => {
    if (!orgLoaded && !orgLoading && parsedTags.length > 0) {
      orgLoad();
    }
  }, [parsedTags.length, orgLoaded, orgLoading, orgLoad]);

  // Group scenarios by version
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

  // Still loading flows from queue
  if (flowsLoading || autoLoading) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[#656d76] gap-2">
        <Spinner size="sm" className="text-[#656d76]" />
        Loading scenarios…
      </div>
    );
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

  // No flows loaded at all
  if (parsedTags.length === 0) {
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
    <div className="flex flex-col h-full">
      {/* Title header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <span className="text-sm font-bold text-[#1f2328]">API Scenario Manager</span>
      </div>
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
  );
}
