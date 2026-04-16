import { useState } from "react";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { useRunnerStore } from "../../store/runner.store";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import { ScenarioFolderTree } from "./ScenarioFolderTree";
import type { ParsedTag } from "../../types/spec.types";

interface VersionAccordionProps {
  version: string;
  tags: ParsedTag[];
  scenarioCount: number;
  sortOrder: "asc" | "desc";
}

/** Gear icon for "Version settings" menu item */
const GearIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

export function VersionAccordion({ version, tags, scenarioCount, sortOrder }: VersionAccordionProps) {
  const open = useExplorerUIStore((s) => s.expandedVersions.has(version));
  const toggleVersion = useExplorerUIStore((s) => s.toggleVersion);
  const toggleFolder = useExplorerUIStore((s) => s.toggleFolder);
  const versionConfig = useScenarioOrgStore((s) => s.versionConfigs[version]);
  const setVersionConfig = useScenarioOrgStore((s) => s.setVersionConfig);
  const createFolder = useScenarioOrgStore((s) => s.createFolder);
  const { selectedTags } = useRunnerStore();

  const [showConfig, setShowConfig] = useState(false);
  const [baseUrl, setBaseUrl] = useState(versionConfig?.baseUrl ?? "");
  const [apiVersion, setApiVersion] = useState(versionConfig?.apiVersion ?? "");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const selectedCount = tags.filter((t) => selectedTags.has(t.name)).length;

  function handleSaveConfig() {
    setVersionConfig(version, { baseUrl: baseUrl.trim(), apiVersion: apiVersion.trim() });
    setShowConfig(false);
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

  // Context menu items for the version header — grey icons, "..." trigger
  const menuItems: Array<{ label: string; icon: React.ReactNode; onClick: () => void }> = [
    {
      label: "New folder",
      icon: MenuIcons.folder,
      onClick: handleCreateFolder,
    },
    {
      label: "Version settings",
      icon: GearIcon,
      onClick: () => setShowConfig(!showConfig),
    },
  ];

  return (
    <div className="mb-1">
      {/* Header */}
      <div className="group flex items-center gap-1">
        <button
          onClick={() => toggleVersion(version)}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-md bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0]/60 transition-colors text-left"
        >
          <svg className={`w-3 h-3 text-[#656d76] shrink-0 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
          <span className="text-[13px] font-bold text-[#1f2328] uppercase">{version}</span>
          <span className="text-xs text-[#656d76] shrink-0">{scenarioCount}</span>
          {selectedCount > 0 && (
            <span className="text-[11px] text-[#0969da] font-medium shrink-0 px-1.5 py-px rounded-full bg-[#ddf4ff] border border-[#b6e3ff]">
              {selectedCount}/{tags.length}
            </span>
          )}
          <div className="flex-1" />
        </button>
        <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ContextMenu items={menuItems} align="left" />
        </span>
      </div>

      {/* Config row */}
      {showConfig && (
        <div className="ml-5 mt-1 mb-1 p-2 rounded-md border border-[#d1d9e0] bg-white space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#656d76] w-16 shrink-0">Base URL</label>
            <input
              className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-2 py-1 outline-none focus:border-[#0969da]"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://apihub.document360.io"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-[#656d76] w-16 shrink-0">API Ver.</label>
            <input
              className="flex-1 text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-2 py-1 outline-none focus:border-[#0969da]"
              value={apiVersion}
              onChange={(e) => setApiVersion(e.target.value)}
              placeholder="v3"
            />
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleSaveConfig}
              className="text-xs font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md px-3 py-1 transition-colors border border-[#1a7f37]/80"
            >
              Save
            </button>
          </div>
        </div>
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
                className="text-[13px] text-[#1f2328] bg-white border border-[#0969da] rounded px-1 py-0.5 w-32 outline-none"
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
    </div>
  );
}
