import { useState } from "react";
import type { HarParseResult } from "../../lib/harParser";
import { HarSessionSection } from "./HarSessionSection";
import { SpecFilePicker } from "./SpecFilePicker";
import { useIdeaFoldersStore } from "../../store/ideaFolders.store";

interface Props {
  folderPath: string;
  onGenerate: (destinationFolder: string, harTrace: string, specFiles?: string[]) => void;
  onClose: () => void;
  disabled?: boolean;
}

export function GenerateFromHarModal({ folderPath, onGenerate, onClose, disabled }: Props) {
  const [destinationFolder, setDestinationFolder] = useState(folderPath);
  const [harResult, setHarResult] = useState<HarParseResult | null>(null);
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);

  const folders = useIdeaFoldersStore((s) => s.folders);
  const folderOptions = buildFolderOptions(folders);

  const canGenerate = !!harResult && !!destinationFolder;

  function handleSubmit() {
    if (!canGenerate) return;
    onGenerate(destinationFolder, harResult!.trace, specFiles.length > 0 ? specFiles : undefined);
    onClose();
  }

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="w-[480px] max-w-[92vw] bg-white rounded-2xl shadow-xl border border-[#d1d9e0]/70 overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1f2328]">Generate from HAR</h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#656d76] hover:text-[#1f2328] transition-colors p-1 -mr-1 rounded-md hover:bg-[#f6f8fa]"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-5 space-y-4 text-left">
          {/* Destination folder */}
          <div>
            <label className="text-sm font-medium text-[#656d76] mb-1.5 block">Destination folder</label>
            <div className="relative">
              <select
                value={destinationFolder}
                onChange={(e) => setDestinationFolder(e.target.value)}
                className="w-full appearance-none text-sm text-[#1f2328] bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0] rounded-lg pl-8 pr-7 py-2 outline-none cursor-pointer transition-colors"
              >
                {folderOptions.map((f) => (
                  <option key={f.path} value={f.path}>{f.display}</option>
                ))}
              </select>
              <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="currentColor" viewBox="0 0 16 16">
                <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
              </svg>
              <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </div>
          </div>

          {/* HAR session recording */}
          <HarSessionSection
            harResult={harResult}
            onHarLoaded={setHarResult}
            onHarRemoved={() => setHarResult(null)}
          />

          {/* Spec files (optional — provides schema context) */}
          <div>
            <label className="text-sm font-medium text-[#656d76] mb-1.5 block">Spec files <span className="text-xs font-normal text-[#656d76]/60">(optional)</span></label>
            <button
              onClick={() => setShowPicker(true)}
              className="w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors text-left border-[#d1d9e0] bg-[#f6f8fa] text-[#1f2328] hover:bg-[#eef1f6]"
            >
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              <span className="flex-1">
                {specFiles.length === 0 ? "Add spec files for richer context..." : `${specFiles.length} file${specFiles.length !== 1 ? "s" : ""} selected`}
              </span>
              <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
              </svg>
            </button>
            <p className="text-xs text-[#656d76]/60 mt-1">Spec files provide API schema details for better idea generation.</p>
          </div>
        </div>

        {/* Footer with generate button */}
        <div className="px-5 pt-4 pb-5 flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={disabled || !canGenerate}
            className="inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#d1d9e0] disabled:cursor-not-allowed rounded-lg px-6 py-2.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            Generate ideas
          </button>
        </div>
      </div>
    </div>

    {/* Spec file picker sub-modal */}
    {showPicker && (
      <SpecFilePicker
        currentPaths={specFiles}
        onSave={setSpecFiles}
        onClose={() => setShowPicker(false)}
      />
    )}
    </>
  );
}

/** Build a flat list of folders with indented display names for a <select> */
function buildFolderOptions(folders: { path: string; name: string; parentPath: string | null; order: number }[]): { path: string; display: string }[] {
  const result: { path: string; display: string }[] = [];
  const childMap = new Map<string | null, typeof folders>();
  for (const f of folders) {
    const key = f.parentPath ?? null;
    if (!childMap.has(key)) childMap.set(key, []);
    childMap.get(key)!.push(f);
  }
  for (const children of childMap.values()) {
    children.sort((a, b) => a.order - b.order);
  }

  function walk(parentPath: string | null, depth: number) {
    const children = childMap.get(parentPath) ?? [];
    for (const child of children) {
      const indent = "\u00A0\u00A0".repeat(depth);
      result.push({ path: child.path, display: `${indent}${child.name}` });
      walk(child.path, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}
