import { useState, useRef, useEffect } from "react";
import type { IdeaMode } from "../../../lib/api/specFilesApi";

const MODE_LABELS: Record<IdeaMode, string> = {
  full: "Full lifecycle",
  "no-prereqs": "Partial",
  "no-prereqs-no-teardown": "Minimal",
};

const MODE_DESCRIPTIONS: Record<IdeaMode, string> = {
  full: "Creates prerequisites, runs tests, tears down everything",
  "no-prereqs": "Uses {{proj.*}} variables for prerequisites, includes teardown",
  "no-prereqs-no-teardown": "No prerequisites, no teardown — quick smoke tests",
};

const MODES: IdeaMode[] = ["full", "no-prereqs", "no-prereqs-no-teardown"];

interface FolderOption {
  path: string;
  display: string;
}

interface ChatInputCardProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  disabled: boolean;
  loading: boolean;
  specFileCount: number;
  noFiles: boolean;
  onOpenPicker: () => void;
  mode: IdeaMode;
  onModeChange: (mode: IdeaMode) => void;
  destinationFolder: string;
  onFolderChange: (folder: string) => void;
  folderOptions: FolderOption[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  placeholder?: string;
}

export function ChatInputCard({
  input,
  onInputChange,
  onSend,
  onKeyDown,
  disabled,
  loading,
  specFileCount,
  noFiles,
  onOpenPicker,
  mode,
  onModeChange,
  destinationFolder,
  onFolderChange,
  folderOptions,
  textareaRef,
  placeholder,
}: ChatInputCardProps) {
  const [showModeDropdown, setShowModeDropdown] = useState(false);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const modeRef = useRef<HTMLDivElement>(null);
  const folderRef = useRef<HTMLDivElement>(null);

  // Close popovers on click-outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (showModeDropdown && modeRef.current && !modeRef.current.contains(e.target as Node)) {
        setShowModeDropdown(false);
      }
      if (showFolderDropdown && folderRef.current && !folderRef.current.contains(e.target as Node)) {
        setShowFolderDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showModeDropdown, showFolderDropdown]);

  const noFolder = !destinationFolder;
  const selectedFolderName = folderOptions.find((f) => f.path === destinationFolder)?.display.trim() ?? "";

  return (
    <div className="rounded-xl border border-[#d1d9e0] shadow-sm bg-white focus-within:ring-2 focus-within:ring-[#0969da]/20 focus-within:border-[#0969da]/50 transition-all">
      {/* Textarea */}
      <textarea
        ref={textareaRef}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = Math.min(Math.max(el.scrollHeight, 60), 150) + "px";
        }}
        placeholder={placeholder ?? "How can I help you today?"}
        disabled={disabled}
        rows={3}
        className="w-full text-sm px-4 pt-3 pb-2 border-0 outline-none resize-none text-[#1f2328] placeholder:text-[#afb8c1] disabled:bg-transparent disabled:cursor-not-allowed bg-transparent rounded-t-xl"
        style={{ minHeight: 60, maxHeight: 150 }}
      />

      {/* Bottom toolbar */}
      <div className="flex items-center gap-1.5 px-3 pb-2.5 pt-1">
        {/* Spec files pill */}
        <button
          onClick={onOpenPicker}
          className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
            noFiles
              ? "text-[#d1242f] bg-[#ffebe9] border-[#d1242f]/20 hover:bg-[#ffcecb]"
              : "text-[#656d76] bg-[#f6f8fa] border-[#d1d9e0]/70 hover:bg-[#eef1f6] hover:text-[#1f2328]"
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          {noFiles ? "Spec files" : `${specFileCount} file${specFileCount !== 1 ? "s" : ""}`}
        </button>

        {/* Mode pill */}
        <div ref={modeRef} className="relative">
          <button
            onClick={() => { setShowModeDropdown((v) => !v); setShowFolderDropdown(false); }}
            className="inline-flex items-center gap-1 text-xs font-medium text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0]/70 rounded-full px-2.5 py-1 hover:bg-[#eef1f6] hover:text-[#1f2328] transition-colors"
          >
            {MODE_LABELS[mode]}
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showModeDropdown && (
            <div className="absolute left-0 bottom-full mb-1 z-10 w-[280px] bg-white rounded-lg shadow-lg border border-[#d1d9e0] py-1">
              {MODES.map((m) => (
                <button
                  key={m}
                  onClick={() => { onModeChange(m); setShowModeDropdown(false); }}
                  className={`w-full text-left px-3 py-2 hover:bg-[#f6f8fa] transition-colors ${
                    mode === m ? "bg-[#ddf4ff]" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-[#1f2328]">{MODE_LABELS[m]}</p>
                  <p className="text-xs text-[#656d76] mt-0.5">{MODE_DESCRIPTIONS[m]}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Destination folder pill */}
        <div ref={folderRef} className="relative">
          <button
            onClick={() => { setShowFolderDropdown((v) => !v); setShowModeDropdown(false); }}
            className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
              noFolder
                ? "text-[#d1242f] bg-[#ffebe9] border-[#d1242f]/20 hover:bg-[#ffcecb]"
                : "text-[#656d76] bg-[#f6f8fa] border-[#d1d9e0]/70 hover:bg-[#eef1f6] hover:text-[#1f2328]"
            }`}
          >
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 16 16">
              <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
            </svg>
            {noFolder ? "Folder" : selectedFolderName || "Folder"}
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
            </svg>
          </button>
          {showFolderDropdown && (
            <div className="absolute left-0 bottom-full mb-1 z-10 w-[260px] bg-white rounded-lg shadow-lg border border-[#d1d9e0] py-1 max-h-[200px] overflow-y-auto">
              <button
                onClick={() => { onFolderChange(""); setShowFolderDropdown(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f8fa] transition-colors ${
                  !destinationFolder ? "text-[#656d76] italic" : "text-[#656d76]"
                }`}
              >
                Select folder...
              </button>
              {folderOptions.map((f) => (
                <button
                  key={f.path}
                  onClick={() => { onFolderChange(f.path); setShowFolderDropdown(false); }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-[#f6f8fa] transition-colors ${
                    destinationFolder === f.path ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#1f2328]"
                  }`}
                >
                  {f.display}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Spacer + Send button */}
        <div className="flex-1" />
        <button
          onClick={onSend}
          disabled={!input.trim() || loading || noFiles}
          className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#1f2328] hover:bg-[#1f2328]/85 disabled:bg-[#d1d9e0] text-white transition-colors"
          title={noFiles ? "Select spec files first" : "Send (Enter)"}
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
