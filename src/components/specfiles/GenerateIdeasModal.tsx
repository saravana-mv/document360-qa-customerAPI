import { useRef, useState } from "react";
import type { IdeaMode, IdeaScope } from "../../lib/api/specFilesApi";
import { IDEA_TEMPLATES } from "../../lib/ideaTemplates";
import { SpecFilePicker } from "./SpecFilePicker";

interface Props {
  onGenerate: (count: number, mode: IdeaMode, specFiles: string[], prompt?: string, scope?: IdeaScope) => void;
  onClose: () => void;
  currentMode: IdeaMode;
  disabled?: boolean;
  showScope?: boolean;
  isVersionRoot?: boolean;
}

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

const COUNT_OPTIONS = [1, 2, 3, 5, 10];

export function GenerateIdeasModal({ onGenerate, onClose, currentMode, disabled, showScope, isVersionRoot }: Props) {
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<IdeaMode>(currentMode);
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<IdeaScope>(isVersionRoot ? "version" : "folder");
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const noFiles = specFiles.length === 0;

  function handleSubmit() {
    if (noFiles) return;
    onGenerate(count, mode, specFiles, prompt.trim() || undefined, showScope ? scope : undefined);
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div
          className="w-[640px] max-w-[92vw] bg-white rounded-2xl shadow-xl border border-[#d1d9e0]/70 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-2">
            <h2 className="text-sm font-semibold text-[#1f2328]">Generate your ideas</h2>
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

          {/* Main input area */}
          <div className="px-5">
            <div className="rounded-xl border border-[#d1d9e0]/70 overflow-hidden">
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What do you want to test?"
              rows={3}
              className="w-full text-sm px-4 pt-4 pb-2 outline-none resize-none text-[#1f2328] placeholder:text-[#afb8c1] bg-transparent"
            />

            {/* Toolbar row — controls + generate button */}
            <div className="flex items-center gap-1 px-3 pb-3">
              {/* Spec file picker button */}
              <button
                onClick={() => setShowPicker(true)}
                className={`inline-flex items-center gap-1 text-xs font-medium rounded-lg px-2 py-1.5 transition-colors ${
                  noFiles
                    ? "text-[#d1242f] bg-[#ffebe9] hover:bg-[#ffcecb]"
                    : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
                }`}
                title="Select spec files for idea generation"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                {noFiles ? "Select files" : `${specFiles.length} file${specFiles.length !== 1 ? "s" : ""}`}
              </button>

              {/* Scope toggle */}
              {showScope && (
                <button
                  onClick={() => setScope(s => s === "folder" ? "version" : "folder")}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] rounded-lg px-2 py-1.5 transition-colors"
                  title={scope === "folder" ? "Scoped to current folder — click for entire version" : "Scoped to entire version — click for current folder"}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    {scope === "version" ? (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 0 0-1.883 2.542l.857 6a2.25 2.25 0 0 0 2.227 1.932H19.05a2.25 2.25 0 0 0 2.227-1.932l.857-6a2.25 2.25 0 0 0-1.883-2.542m-16.5 0V6A2.25 2.25 0 0 1 6 3.75h3.879a1.5 1.5 0 0 1 1.06.44l2.122 2.12a1.5 1.5 0 0 0 1.06.44H18A2.25 2.25 0 0 1 20.25 9v.776" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                    )}
                  </svg>
                  {scope === "folder" ? "This folder" : "Entire version"}
                </button>
              )}

              {/* Mode dropdown */}
              <div className="relative">
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as IdeaMode)}
                  className="appearance-none text-xs font-medium text-[#656d76] hover:text-[#1f2328] bg-transparent hover:bg-[#f6f8fa] rounded-lg pl-2 pr-5 py-1.5 outline-none cursor-pointer transition-colors"
                  title={MODE_DESCRIPTIONS[mode]}
                >
                  {MODES.map(m => (
                    <option key={m} value={m}>{MODE_LABELS[m]}</option>
                  ))}
                </select>
                <svg className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>

              {/* Count dropdown */}
              <div className="relative">
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="appearance-none text-xs font-medium text-[#656d76] hover:text-[#1f2328] bg-transparent hover:bg-[#f6f8fa] rounded-lg pl-2 pr-5 py-1.5 outline-none cursor-pointer transition-colors"
                >
                  {COUNT_OPTIONS.map(n => (
                    <option key={n} value={n}>{n} idea{n !== 1 ? "s" : ""}</option>
                  ))}
                </select>
                <svg className="w-3 h-3 absolute right-1 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </div>

              <div className="flex-1" />

              {/* Generate button */}
              <button
                onClick={handleSubmit}
                disabled={disabled || noFiles}
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#1f2328] hover:bg-[#1f2328]/85 disabled:bg-[#d1d9e0] text-white transition-colors shrink-0"
                title={noFiles ? "Select spec files first" : `Generate ${count} idea${count !== 1 ? "s" : ""} (Ctrl+Enter)`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                </svg>
              </button>
            </div>
            </div>
          </div>

          {/* Template chips */}
          <div className="flex flex-wrap items-center justify-center gap-2 mt-3 px-5">
            {IDEA_TEMPLATES.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setPrompt(prompt === t.prompt ? "" : t.prompt);
                  textareaRef.current?.focus();
                }}
                className={`inline-flex items-center gap-1.5 text-xs font-medium pl-2.5 pr-3 py-1.5 rounded-full border transition-all ${
                  prompt === t.prompt
                    ? "bg-[#ddf4ff] text-[#0969da] border-[#0969da]/30 shadow-sm"
                    : "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]/70 hover:border-[#afb8c1] hover:text-[#1f2328] hover:shadow-sm"
                }`}
              >
                <span className="opacity-60">{chipIcon(t.key)}</span>
                {t.label}
              </button>
            ))}
          </div>

          {/* Mode description hint */}
          <p className="text-center text-xs text-[#656d76]/70 mt-2.5 pb-4">
            {MODE_DESCRIPTIONS[mode]}
          </p>
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

function chipIcon(key: string): React.ReactNode {
  const cls = "w-3 h-3";
  switch (key) {
    case "crud":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" /></svg>;
    case "errors":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" /></svg>;
    case "cross-entity":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" /></svg>;
    case "bulk":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75 2.25 12l4.179 2.25m0-4.5 5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0 4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0-5.571 3-5.571-3" /></svg>;
    case "state":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5 7.5 3m0 0L12 7.5M7.5 3v13.5m13.5 0L16.5 21m0 0L12 16.5m4.5 4.5V7.5" /></svg>;
    case "auth":
      return <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>;
    default:
      return null;
  }
}
