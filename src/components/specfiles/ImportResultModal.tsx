import { useState, useMemo } from "react";
import { Modal } from "../common/Modal";
import type { SuggestedVariable } from "../../lib/api/specFilesApi";

interface ImportResultModalProps {
  open: boolean;
  folderName: string;
  stats: { endpoints: number; folders: number };
  suggestedVariables: SuggestedVariable[];
  existingVariableNames: Set<string>;
  onDone: (selectedNames: string[]) => void;
  onSkip: () => void;
}

export function ImportResultModal({
  open,
  folderName,
  stats,
  suggestedVariables,
  existingVariableNames,
  onDone,
  onSkip,
}: ImportResultModalProps) {
  const newVars = useMemo(
    () => suggestedVariables.filter(v => !existingVariableNames.has(v.name)),
    [suggestedVariables, existingVariableNames],
  );
  const existingVars = useMemo(
    () => suggestedVariables.filter(v => existingVariableNames.has(v.name)),
    [suggestedVariables, existingVariableNames],
  );

  const [selected, setSelected] = useState<Set<string>>(() => new Set(newVars.map(v => v.name)));

  const toggleOne = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === newVars.length) setSelected(new Set());
    else setSelected(new Set(newVars.map(v => v.name)));
  };

  const selectedCount = selected.size;
  const hasVariables = suggestedVariables.length > 0;

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title="Import Complete"
      maxWidth="max-w-xl"
      footer={
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa] transition-colors"
          >
            Skip
          </button>
          {hasVariables && (
            <button
              onClick={() => onDone(Array.from(selected))}
              disabled={selectedCount === 0}
              className="px-3 py-1.5 text-sm rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: selectedCount > 0 ? "#1a7f37" : "#8b949e" }}
            >
              {selectedCount > 0 ? `Save ${selectedCount} variable${selectedCount > 1 ? "s" : ""}` : "No variables selected"}
            </button>
          )}
        </div>
      }
    >
      {/* Stats */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-md" style={{ backgroundColor: "#ddf4ff" }}>
        <svg className="w-4 h-4 shrink-0" style={{ color: "#1a7f37" }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
        <span className="text-sm text-[#1f2328]">
          Created <strong>{folderName}</strong> with {stats.endpoints} endpoint{stats.endpoints !== 1 ? "s" : ""} in {stats.folders} folder{stats.folders !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Variables section */}
      {hasVariables && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#1f2328]">Detected Path Parameters</h3>
            {newVars.length > 0 && (
              <button
                onClick={toggleAll}
                className="text-xs text-[#0969da] hover:underline"
                title={selected.size === newVars.length ? "Deselect all" : "Select all"}
              >
                {selected.size === newVars.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <p className="text-xs text-[#656d76] mb-3">
            Selected parameters will be saved as project variables with empty values. Configure their values in Settings &rarr; Variables.
          </p>
          <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
            {newVars.map(v => (
              <label
                key={v.name}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[#f6f8fa] transition-colors cursor-pointer border-b border-[#d1d9e0] last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selected.has(v.name)}
                  onChange={() => toggleOne(v.name)}
                  className="rounded accent-[#0969da]"
                />
                <code className="text-sm font-mono text-[#1f2328] shrink-0">{v.name}</code>
                <span className="text-xs text-[#656d76] truncate flex-1">{v.description !== v.name ? v.description : ""}</span>
                <span className="text-xs text-[#656d76] shrink-0 px-1.5 py-0.5 rounded bg-[#f6f8fa] border border-[#d1d9e0]">
                  {v.type}{v.format ? ` \u00b7 ${v.format}` : ""}
                </span>
              </label>
            ))}
            {existingVars.map(v => (
              <label
                key={v.name}
                className="flex items-center gap-3 px-3 py-2 border-b border-[#d1d9e0] last:border-b-0 opacity-50 cursor-default"
              >
                <input type="checkbox" checked disabled className="rounded" />
                <code className="text-sm font-mono text-[#656d76] shrink-0">{v.name}</code>
                <span className="text-xs text-[#656d76] italic shrink-0">(already exists)</span>
                <span className="flex-1" />
                <span className="text-xs text-[#656d76] shrink-0 px-1.5 py-0.5 rounded bg-[#f6f8fa] border border-[#d1d9e0]">
                  {v.type}{v.format ? ` \u00b7 ${v.format}` : ""}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* No variables */}
      {!hasVariables && (
        <p className="text-xs text-[#656d76]">No path parameters detected in this spec.</p>
      )}
    </Modal>
  );
}
