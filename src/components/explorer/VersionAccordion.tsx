import { useState, useCallback } from "react";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { useRunnerStore } from "../../store/runner.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useSpecStore } from "../../store/spec.store";
import { useUserStore } from "../../store/user.store";
import { ScenarioFolderTree } from "./ScenarioFolderTree";
import { ProjectSettingsCard } from "../setup/ProjectSettingsCard";
import { ConnectEndpointModal } from "./ConnectEndpointModal";
import { getAllTests, getTestsByTag, unregisterWhere } from "../../lib/tests/registry";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { deactivateFlow } from "../../lib/tests/flowXml/activeTests";
import type { ParsedTag } from "../../types/spec.types";

interface VersionAccordionProps {
  version: string;
  tags: ParsedTag[];
  scenarioCount: number;
  sortOrder: "asc" | "desc";
}


const EMPTY_SET = new Set<string>();
const EMPTY_ARR: string[] = [];

export function VersionAccordion({ version, tags, scenarioCount, sortOrder }: VersionAccordionProps) {
  const open = useExplorerUIStore((s) => s.expandedVersions.has(version));
  const toggleVersion = useExplorerUIStore((s) => s.toggleVersion);
  const toggleFolder = useExplorerUIStore((s) => s.toggleFolder);
  const versionConfig = useScenarioOrgStore((s) => s.versionConfigs[version]);
  const createFolder = useScenarioOrgStore((s) => s.createFolder);
  const { selectedTags } = useRunnerStore();

  const [showConnect, setShowConnect] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [showDeleteAll, setShowDeleteAll] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);

  const canRearrange = useUserStore((s) => s.hasRole("qa_manager"));
  const selectMode = useExplorerUIStore((s) => s.selectMode);
  const rearrangeMode = useExplorerUIStore((s) => s.rearrangeMode);
  const toggleSelectMode = useExplorerUIStore((s) => s.toggleSelectMode);
  const toggleRearrangeMode = useExplorerUIStore((s) => s.toggleRearrangeMode);
  const toggleSortOrder = useExplorerUIStore((s) => s.toggleSortOrder);
  const { clearSelection } = useRunnerStore();
  const setSpec = useSpecStore((s) => s.setSpec);

  const isAuthed = true; // Always authenticated via Entra ID
  const selectedCount = tags.filter((t) => selectedTags.has(t.name)).length;
  const noScenarios = tags.length === 0;
  const fewScenarios = tags.length <= 1;

  const isConnected = versionConfig?.credentialConfigured || (versionConfig?.authType === "oauth" && !!versionConfig?.connectionId);

  // Expand/collapse all folders + tags within this version
  const versionFolders = useScenarioOrgStore((s) => s.folders[version] ?? EMPTY_ARR);
  const expandedFolders = useExplorerUIStore((s) => s.expandedFolders[version] ?? EMPTY_SET);
  const expandedTags = useExplorerUIStore((s) => s.expandedTags);
  const isAllExpanded = (expandedFolders.size > 0 || tags.some((t) => expandedTags.has(t.name)));

  const handleExpandAll = useCallback(() => {
    // Expand this version, all its folders, and all its tags
    const ev = new Set(useExplorerUIStore.getState().expandedVersions);
    ev.add(version);
    const ef = { ...useExplorerUIStore.getState().expandedFolders };
    ef[version] = new Set(versionFolders);
    const et = new Set(useExplorerUIStore.getState().expandedTags);
    for (const t of tags) et.add(t.name);
    useExplorerUIStore.setState({ expandedVersions: ev, expandedFolders: ef, expandedTags: et });
  }, [version, versionFolders, tags]);

  const handleCollapseAll = useCallback(() => {
    const ef = { ...useExplorerUIStore.getState().expandedFolders };
    ef[version] = new Set<string>();
    const et = new Set(useExplorerUIStore.getState().expandedTags);
    for (const t of tags) et.delete(t.name);
    useExplorerUIStore.setState({ expandedFolders: ef, expandedTags: et });
  }, [version, tags]);

  // Delete selected scenarios in this version
  async function handleDeleteSelected() {
    const selectedInVersion = tags.filter((t) => selectedTags.has(t.name));
    if (selectedInVersion.length === 0) return;
    const targetTests = getAllTests().filter((t) => selectedInVersion.some((st) => st.name === t.tag));
    for (const t of targetTests) {
      if (t.flowFileName) await deactivateFlow(t.flowFileName);
    }
    const flowFileNames = new Set(targetTests.map((t) => t.flowFileName).filter(Boolean) as string[]);
    unregisterWhere((def) => def.flowFileName !== undefined && flowFileNames.has(def.flowFileName));
    const flowStatus = useFlowStatusStore.getState();
    const remaining = new Set(
      Object.keys(flowStatus.byName).filter((n) => !flowFileNames.has(n)),
    );
    flowStatus.pruneTo(remaining);
    clearSelection();
    const built = buildParsedTagsFromRegistry();
    setSpec(null as never, built, null as never);
    setShowDeleteAll(false);
  }

  // Select/deselect all scenarios in this version
  const allTagsSelected = tags.length > 0 && tags.every((t) => selectedTags.has(t.name));

  function handleSelectAll() {
    const runner = useRunnerStore.getState();
    const newTags = new Set(runner.selectedTags);
    const newTests = new Set(runner.selectedTests);
    for (const t of tags) {
      newTags.add(t.name);
      const tests = getTestsByTag(t.name);
      for (const test of tests) newTests.add(test.id);
    }
    useRunnerStore.setState({ selectedTags: newTags, selectedTests: newTests });
  }

  function handleDeselectAll() {
    const runner = useRunnerStore.getState();
    const newTags = new Set(runner.selectedTags);
    const newTests = new Set(runner.selectedTests);
    for (const t of tags) {
      newTags.delete(t.name);
      const tests = getTestsByTag(t.name);
      for (const test of tests) newTests.delete(test.id);
    }
    useRunnerStore.setState({ selectedTags: newTags, selectedTests: newTests });
  }

  function handleCreateFolder() {
    setCreatingFolder(true);
    setNewFolderName("");
    // Auto-expand the version so user sees the input
    if (!open) toggleVersion(version);
  }

  function confirmCreateFolder() {
    const name = newFolderName.trim();
    if (!name) { setCreatingFolder(false); return; }
    createFolder(version, name);
    setCreatingFolder(false);
    // Auto-expand the new folder
    toggleFolder(version, name);
  }

  return (
    <div className="mb-1">
      {/* Header row */}
      <div className="flex items-center gap-1 px-2 py-1.5 rounded-md bg-[#f6f8fa] border border-[#d1d9e0]/60">
        <button
          onClick={() => toggleVersion(version)}
          className="flex items-center gap-2 min-w-0 text-left"
        >
          <svg className={`w-3 h-3 text-[#656d76] shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
          <span className="text-sm font-bold text-[#1f2328] uppercase">{version}</span>
          <span className="text-xs text-[#656d76] shrink-0">{scenarioCount}</span>
          {selectedCount > 0 && (
            <span className="text-xs text-[#0969da] font-medium shrink-0 px-1.5 py-px rounded-full bg-[#ddf4ff] border border-[#b6e3ff]">
              {selectedCount}/{tags.length}
            </span>
          )}
          {/* Connection badge */}
          {isConnected ? (
            <button
              onClick={(e) => { e.stopPropagation(); setShowConnect(true); }}
              className="text-xs text-[#1a7f37] font-medium shrink-0 px-1.5 py-px rounded-full bg-[#dafbe1] border border-[#aceebb] hover:bg-[#aceebb] transition-colors truncate max-w-[120px]"
              title={`Connected: ${versionConfig?.endpointLabel || versionConfig?.baseUrl || "configured"}`}
            >
              {versionConfig?.endpointLabel || versionConfig?.baseUrl || "Connected"}
            </button>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); setShowConnect(true); }}
              className="text-xs text-[#9a6700] font-medium shrink-0 px-1.5 py-px rounded-full bg-[#fff8c5] border border-[#d4a72c]/30 hover:bg-[#d4a72c]/20 transition-colors"
              title="Click to connect endpoint"
            >
              Not connected
            </button>
          )}
        </button>
        <div className="flex-1" />

        {/* ── Navigation ── */}
        <button
          onClick={isAllExpanded ? handleCollapseAll : handleExpandAll}
          disabled={!isAuthed || noScenarios}
          title={isAllExpanded ? "Collapse all" : "Expand all"}
          className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed || noScenarios ? "text-[#656d76] opacity-40 cursor-not-allowed" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
        >
          {isAllExpanded ? (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l7.5-7.5 7.5 7.5m-15 5.25l7.5-7.5 7.5 7.5" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 5.25l-7.5 7.5-7.5-7.5m15 5.25l-7.5 7.5-7.5-7.5" />
            </svg>
          )}
        </button>
        <button
          onClick={toggleSortOrder}
          disabled={!isAuthed || fewScenarios}
          title={sortOrder === "asc" ? "Sort A → Z" : "Sort Z → A"}
          className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed || fewScenarios ? "text-[#656d76] opacity-40 cursor-not-allowed" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            {sortOrder === "asc" ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m6-6v12m0 0-3.75-3.75M14.25 19.5l3.75-3.75" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h5.25m6 6V7.5m0 0 3.75 3.75M14.25 7.5 18 3.75" />
            )}
          </svg>
        </button>

        <span className="w-px h-4 bg-[#d1d9e0] shrink-0" />

        {/* ── Organization ── */}
        {canRearrange && (
          <button
            onClick={toggleRearrangeMode}
            disabled={!isAuthed || noScenarios}
            title={rearrangeMode ? "Exit rearrange mode" : "Rearrange scenarios"}
            className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed || noScenarios ? "text-[#656d76] opacity-40 cursor-not-allowed" : rearrangeMode ? "text-[#0969da] bg-[#ddf4ff]" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
          >
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
              <circle cx="5" cy="3" r="1.5" />
              <circle cx="11" cy="3" r="1.5" />
              <circle cx="5" cy="8" r="1.5" />
              <circle cx="11" cy="8" r="1.5" />
              <circle cx="5" cy="13" r="1.5" />
              <circle cx="11" cy="13" r="1.5" />
            </svg>
          </button>
        )}
        <button
          onClick={() => {
            if (selectMode) { handleDeselectAll(); }
            toggleSelectMode();
          }}
          disabled={!isAuthed || noScenarios}
          title={selectMode ? "Exit select mode" : "Multi-select scenarios"}
          className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed || noScenarios ? "text-[#656d76] opacity-40 cursor-not-allowed" : selectMode ? "text-[#0969da] bg-[#ddf4ff]" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
        </button>
        {selectMode && (
          <button
            onClick={allTagsSelected ? handleDeselectAll : handleSelectAll}
            title={allTagsSelected ? "Deselect all" : "Select all"}
            className="shrink-0 rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
          >
            {allTagsSelected ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
          </button>
        )}

        <span className="w-px h-4 bg-[#d1d9e0] shrink-0" />

        {/* ── Create ── */}
        <button
          onClick={handleCreateFolder}
          disabled={!isAuthed}
          title="New folder"
          className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed ? "text-[#656d76] opacity-40 cursor-not-allowed" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        </button>

        <span className="w-px h-4 bg-[#d1d9e0] shrink-0" />

        {/* ── Settings ── */}
        <button
          onClick={() => setShowProjectSettings(!showProjectSettings)}
          title="Project settings"
          className={`shrink-0 rounded-md p-1 transition-colors ${showProjectSettings ? "text-[#0969da] bg-[#ddf4ff]" : "text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0m3 0a1.5 1.5 0 1 0-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m-9.75 0h9.75" />
          </svg>
        </button>
        <button
          onClick={() => setShowConnect(true)}
          title="Connect endpoint"
          className={`shrink-0 rounded-md p-1 transition-colors ${isConnected ? "text-[#1a7f37] hover:text-[#1a7f37] hover:bg-[#dafbe1]" : "text-[#9a6700] hover:text-[#9a6700] hover:bg-[#fff8c5]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
          </svg>
        </button>

        <span className="w-px h-4 bg-[#d1d9e0] shrink-0" />

        {/* ── Danger ── */}
        <button
          onClick={() => setShowDeleteAll(true)}
          disabled={!isAuthed || selectedCount === 0}
          title={selectedCount === 0 ? "Select scenarios to delete" : `Delete ${selectedCount} selected scenario${selectedCount !== 1 ? "s" : ""}`}
          className={`shrink-0 rounded-md p-1 transition-colors ${!isAuthed || selectedCount === 0 ? "text-[#656d76] opacity-40 cursor-not-allowed" : "text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9]"}`}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
          </svg>
        </button>
      </div>

      {/* Project settings */}
      {showProjectSettings && (
        <div className="ml-5 mt-1 mb-1 border border-[#d1d9e0] rounded-md overflow-hidden">
          <ProjectSettingsCard onDone={() => setShowProjectSettings(false)} />
        </div>
      )}

      {/* Connect Endpoint Modal */}
      {showConnect && (
        <ConnectEndpointModal version={version} onClose={() => setShowConnect(false)} />
      )}

      {/* Folder tree + inline create */}
      {open && (
        <div className="mt-0.5">
          <ScenarioFolderTree version={version} tags={tags} sortOrder={sortOrder} />
          {/* Inline folder creation at version root level */}
          {creatingFolder && (
            <div className="flex items-center gap-2 ml-2 px-2 py-1">
              <svg className="w-4 h-4 shrink-0 text-[#656d76]" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
              </svg>
              <input
                autoFocus
                className="text-sm text-[#1f2328] bg-white border border-[#0969da] rounded px-1 py-0.5 w-32 outline-none"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreateFolder();
                  if (e.key === "Escape") setCreatingFolder(false);
                }}
                onBlur={confirmCreateFolder}
              />
            </div>
          )}
        </div>
      )}
      {/* Delete selected confirmation modal */}
      {showDeleteAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteAll(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
              <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </div>
              <span className="text-base font-semibold text-[#1f2328]">Delete {selectedCount} selected scenario{selectedCount !== 1 ? "s" : ""}?</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <p className="text-sm text-[#656d76] leading-relaxed">
                This will unregister <strong className="text-[#1f2328]">{selectedCount} scenario{selectedCount !== 1 ? "s" : ""}</strong> from the runner.
              </p>
              <p className="text-sm text-[#656d76] leading-relaxed">
                Flow XML files are preserved — you can recreate scenarios from them at any time.
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
                onClick={() => void handleDeleteSelected()}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
              >
                Delete {selectedCount} scenario{selectedCount !== 1 ? "s" : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
