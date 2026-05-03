import { useState, useMemo, useCallback, useEffect } from "react";
import type { HarParseResult } from "../../lib/harParser";
import { compactTrace } from "../../lib/harParser";
import { matchHarToSpecs } from "../../lib/harSpecMatcher";
import { listSpecFiles } from "../../lib/api/specFilesApi";
import { HarSessionSection } from "./HarSessionSection";
import { SpecFilePicker } from "./SpecFilePicker";
import { useIdeaFoldersStore } from "../../store/ideaFolders.store";
import { useSetupStore } from "../../store/setup.store";

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
  const [matching, setMatching] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [selectedCallIndices, setSelectedCallIndices] = useState<Set<number>>(new Set());
  const [allSpecPaths, setAllSpecPaths] = useState<string[]>([]);

  const harBaseUrl = useSetupStore((s) => s.harBaseUrl);
  const folders = useIdeaFoldersStore((s) => s.folders);
  const folderOptions = buildFolderOptions(folders);

  // Derived: selected API calls
  const selectedCalls = useMemo(() => {
    if (!harResult) return [];
    return harResult.apiCalls.filter((_, i) => selectedCallIndices.has(i));
  }, [harResult, selectedCallIndices]);

  const canGenerate = !!harResult && !!destinationFolder && selectedCalls.length > 0;

  // Re-run spec matching when selected calls change
  useEffect(() => {
    if (selectedCalls.length === 0 || allSpecPaths.length === 0) {
      setSpecFiles([]);
      return;
    }
    const matched = matchHarToSpecs(selectedCalls, allSpecPaths);
    setSpecFiles(matched);
  }, [selectedCalls, allSpecPaths]);

  const handleHarLoaded = useCallback(async (result: HarParseResult) => {
    setHarResult(result);
    // Select all calls by default
    setSelectedCallIndices(new Set(result.apiCalls.map((_, i) => i)));
    // Load spec files for matching
    setMatching(true);
    try {
      const allFiles = await listSpecFiles();
      const paths = allFiles.map(f => f.name);
      setAllSpecPaths(paths);
      const matched = matchHarToSpecs(result.apiCalls, paths);
      setSpecFiles(matched);
    } catch {
      // If listing fails, leave specFiles empty
    } finally {
      setMatching(false);
    }
  }, []);

  const handleHarRemoved = useCallback(() => {
    setHarResult(null);
    setSpecFiles([]);
    setSelectedCallIndices(new Set());
    setAllSpecPaths([]);
  }, []);

  function handleSubmit() {
    if (!canGenerate) return;
    // Rebuild trace from selected calls only
    const trace = compactTrace(selectedCalls);
    onGenerate(destinationFolder, trace, specFiles.length > 0 ? specFiles : undefined);
    onClose();
  }

  function toggleCall(index: number) {
    setSelectedCallIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (!harResult) return;
    if (selectedCallIndices.size === harResult.apiCalls.length) {
      setSelectedCallIndices(new Set());
    } else {
      setSelectedCallIndices(new Set(harResult.apiCalls.map((_, i) => i)));
    }
  }

  const allSelected = harResult ? selectedCallIndices.size === harResult.apiCalls.length : false;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="w-[520px] max-w-[92vw] bg-white rounded-2xl shadow-xl border border-[#d1d9e0]/70 overflow-hidden"
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
            onHarLoaded={handleHarLoaded}
            onHarRemoved={handleHarRemoved}
            forceBaseUrl={harBaseUrl || undefined}
          />

          {/* HAR Call Picker */}
          {harResult && harResult.apiCalls.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-medium text-[#656d76]">Select API calls</label>
                <span className="text-xs text-[#656d76]">
                  {selectedCallIndices.size} of {harResult.apiCalls.length} calls
                </span>
              </div>
              <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                {/* Select all header */}
                <button
                  onClick={toggleAll}
                  className="w-full flex items-center gap-2 px-3 py-1.5 bg-[#f6f8fa] border-b border-[#d1d9e0] text-xs text-[#656d76] hover:bg-[#eef1f6] transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={allSelected}
                    readOnly
                    className="w-3.5 h-3.5 rounded border-[#d1d9e0] text-[#0969da] accent-[#0969da]"
                  />
                  <span>{allSelected ? "Deselect all" : "Select all"}</span>
                </button>
                {/* Call list */}
                <div className="max-h-[200px] overflow-y-auto divide-y divide-[#d1d9e0]/50">
                  {harResult.apiCalls.map((call, i) => (
                    <label
                      key={i}
                      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors hover:bg-[#f6f8fa] ${
                        selectedCallIndices.has(i) ? "bg-white" : "bg-[#f6f8fa]/50 opacity-60"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCallIndices.has(i)}
                        onChange={() => toggleCall(i)}
                        className="w-3.5 h-3.5 rounded border-[#d1d9e0] text-[#0969da] accent-[#0969da] shrink-0"
                      />
                      <MethodBadge method={call.method} />
                      <span className="text-xs text-[#1f2328] truncate flex-1 font-mono">
                        {call.pathTemplate}
                      </span>
                      <span className={`text-xs shrink-0 ${call.status < 400 ? "text-[#1a7f37]" : "text-[#d1242f]"}`}>
                        {call.status}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Auto-matched spec files */}
          {harResult && (
            <div>
              <label className="text-sm font-medium text-[#656d76] mb-1.5 block">
                Matched spec files
              </label>
              {matching ? (
                <p className="text-sm text-[#656d76]">Matching HAR calls to spec files...</p>
              ) : (
                <>
                  <button
                    onClick={() => setShowPicker(true)}
                    className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors text-left ${
                      specFiles.length === 0
                        ? "border-[#bf8700]/30 bg-[#fff8c5]/50 text-[#1f2328] hover:bg-[#fff8c5]"
                        : "border-[#1a7f37]/30 bg-[#dafbe1]/50 text-[#1f2328] hover:bg-[#dafbe1]"
                    }`}
                  >
                    <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <span className="flex-1">
                      {specFiles.length === 0
                        ? "No matching specs found — click to select manually"
                        : `${specFiles.length} spec file${specFiles.length !== 1 ? "s" : ""} auto-matched`}
                    </span>
                    <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                    </svg>
                  </button>
                  <p className="text-xs text-[#656d76]/60 mt-1">
                    {specFiles.length > 0
                      ? "Auto-matched from HAR endpoints. Click to review or adjust."
                      : "Select spec files manually to provide API schema context."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer with generate button */}
        <div className="px-5 pt-4 pb-5 flex justify-center">
          <button
            onClick={handleSubmit}
            disabled={disabled || !canGenerate || matching}
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

/** Method badge with color coding */
function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-[#ddf4ff] text-[#0969da]",
    POST: "bg-[#dafbe1] text-[#1a7f37]",
    PUT: "bg-[#fff8c5] text-[#9a6700]",
    PATCH: "bg-[#fff8c5] text-[#9a6700]",
    DELETE: "bg-[#ffebe9] text-[#d1242f]",
  };
  const cls = colors[method] ?? "bg-[#f6f8fa] text-[#656d76]";
  return (
    <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cls} shrink-0 w-12 text-center`}>
      {method}
    </span>
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
