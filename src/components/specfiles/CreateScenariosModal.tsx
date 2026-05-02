// Modal for choosing a target folder when creating scenarios from flows.
// Shows existing folders for the version, allows creating a new folder,
// and defaults to "(Default)" which maps to the NEWLY_ADDED sentinel.

import { useState, useMemo, useCallback } from "react";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { NEWLY_ADDED, isNewlyAdded } from "../../lib/treeUtils";
import type { GeneratedFlow } from "./FlowsPanel";

interface Props {
  /** Flows that will be turned into scenarios */
  flows: GeneratedFlow[];
  /** Version prefix (e.g. "V3") extracted from flow paths */
  version: string;
  /** Called with the selected target folder when user confirms */
  onConfirm: (targetFolder: string | undefined) => void;
  onClose: () => void;
}

export function CreateScenariosModal({ flows, version, onConfirm, onClose }: Props) {
  const allFolders = useScenarioOrgStore((s) => s.folders);
  const versionFolders = useMemo(() => allFolders[version] ?? [NEWLY_ADDED], [allFolders, version]);

  // Only show top-level folders (no nested paths) for simplicity
  const folderOptions = useMemo(() => {
    const opts: { value: string; label: string }[] = [];
    for (const f of versionFolders) {
      if (isNewlyAdded(f)) {
        opts.unshift({ value: NEWLY_ADDED, label: "(Default)" });
      } else {
        opts.push({ value: f, label: f });
      }
    }
    // Ensure (Default) is always present
    if (!opts.some((o) => o.value === NEWLY_ADDED)) {
      opts.unshift({ value: NEWLY_ADDED, label: "(Default)" });
    }
    return opts;
  }, [versionFolders]);

  const [selected, setSelected] = useState(NEWLY_ADDED);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const handleConfirm = useCallback(() => {
    const target = selected === NEWLY_ADDED ? undefined : selected;
    onConfirm(target);
  }, [selected, onConfirm]);

  const handleCreateFolder = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) return;
    // Add the folder to the store
    useScenarioOrgStore.getState().createFolder(version, name);
    setSelected(name);
    setCreatingNew(false);
    setNewFolderName("");
  }, [newFolderName, version]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[480px] max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#d1d9e0]">
          <h2 className="text-sm font-semibold text-[#1f2328]">
            Create {flows.length} scenario{flows.length !== 1 ? "s" : ""}
          </h2>
          <button
            onClick={onClose}
            className="text-[#656d76] hover:text-[#1f2328] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 overflow-y-auto">
          {/* Flow list preview */}
          <div>
            <label className="text-sm font-medium text-[#656d76] uppercase tracking-wide">Flows</label>
            <div className="mt-1.5 max-h-[120px] overflow-y-auto border border-[#d1d9e0] rounded-md bg-[#f6f8fa]">
              {flows.map((f) => (
                <div key={f.ideaId} className="px-3 py-1.5 text-sm text-[#1f2328] border-b border-[#d1d9e0]/50 last:border-b-0 truncate">
                  {f.title}
                </div>
              ))}
            </div>
          </div>

          {/* Folder picker */}
          <div>
            <label className="text-sm font-medium text-[#656d76] uppercase tracking-wide">Target folder in Scenario Manager</label>
            <div className="mt-1.5 space-y-1">
              {folderOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-md border cursor-pointer transition-colors ${
                    selected === opt.value
                      ? "border-[#0969da] bg-[#ddf4ff]/40"
                      : "border-[#d1d9e0] hover:bg-[#f6f8fa]"
                  }`}
                >
                  <input
                    type="radio"
                    name="targetFolder"
                    value={opt.value}
                    checked={selected === opt.value}
                    onChange={() => setSelected(opt.value)}
                    className="accent-[#0969da]"
                  />
                  <span className={`text-sm ${opt.value === NEWLY_ADDED ? "text-[#656d76] italic" : "text-[#1f2328]"}`}>
                    {opt.label}
                  </span>
                  {opt.value === NEWLY_ADDED && (
                    <span className="text-sm text-[#8b949e] ml-auto">Unsorted</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          {/* New folder creation */}
          {creatingNew ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                type="text"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setCreatingNew(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-3 py-1.5 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
              />
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim()}
                className="px-3 py-1.5 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-40"
              >
                Add
              </button>
              <button
                onClick={() => { setCreatingNew(false); setNewFolderName(""); }}
                className="px-3 py-1.5 text-sm font-medium text-[#656d76] hover:text-[#1f2328] rounded-md transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              className="flex items-center gap-1.5 text-sm text-[#0969da] hover:text-[#0969da]/80 font-medium transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              New folder
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm font-medium text-[#1f2328] bg-white border border-[#d1d9e0] hover:bg-[#f6f8fa] rounded-md transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-1.5 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors"
          >
            Create {flows.length} scenario{flows.length !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
