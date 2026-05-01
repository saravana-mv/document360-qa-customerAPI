import { useState } from "react";
import type { IdeaMode } from "../../lib/api/specFilesApi";
import { IDEA_TEMPLATES } from "../../lib/ideaTemplates";
import { SpecFilePicker } from "./SpecFilePicker";

interface Props {
  folderPath: string;
  onGenerate: (count: number, mode: IdeaMode, specFiles: string[], prompt?: string) => void;
  onClose: () => void;
  currentMode: IdeaMode;
  disabled?: boolean;
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

export function GenerateIdeasModal({ folderPath, onGenerate, onClose, currentMode, disabled }: Props) {
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<IdeaMode>(currentMode);
  const [specFiles, setSpecFiles] = useState<string[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);

  const noFiles = specFiles.length === 0;

  function handleSubmit() {
    if (noFiles) return;
    const template = IDEA_TEMPLATES.find((t) => t.key === selectedTemplate);
    onGenerate(count, mode, specFiles, template?.prompt);
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
        <div
          className="w-[480px] max-w-[92vw] bg-white rounded-2xl shadow-xl border border-[#d1d9e0]/70 overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-4 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-[#1f2328]">Generate ideas</h2>
              <p className="text-xs text-[#656d76] mt-0.5">
                <svg className="w-3 h-3 inline-block mr-1 -mt-0.5 text-[#9a6700]" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                </svg>
                {folderPath}
              </p>
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

          <div className="px-5 space-y-4">
            {/* Spec files */}
            <div>
              <label className="text-xs font-medium text-[#656d76] mb-1.5 block">Spec files</label>
              <button
                onClick={() => setShowPicker(true)}
                className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg border transition-colors text-left ${
                  noFiles
                    ? "border-[#d1242f]/40 bg-[#ffebe9]/30 text-[#d1242f] hover:bg-[#ffebe9]/60"
                    : "border-[#d1d9e0] bg-[#f6f8fa] text-[#1f2328] hover:bg-[#eef1f6]"
                }`}
              >
                <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <span className="flex-1">
                  {noFiles ? "Select spec files..." : `${specFiles.length} file${specFiles.length !== 1 ? "s" : ""} selected`}
                </span>
                <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>

            {/* Pattern chips */}
            <div>
              <label className="text-xs font-medium text-[#656d76] mb-1.5 block">Pattern</label>
              <div className="flex flex-wrap gap-1.5">
                {IDEA_TEMPLATES.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setSelectedTemplate(selectedTemplate === t.key ? null : t.key)}
                    className={`inline-flex items-center gap-1.5 text-xs font-medium pl-2 pr-2.5 py-1.5 rounded-full border transition-all ${
                      selectedTemplate === t.key
                        ? "bg-[#ddf4ff] text-[#0969da] border-[#0969da]/30 shadow-sm"
                        : "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]/70 hover:border-[#afb8c1] hover:text-[#1f2328]"
                    }`}
                    title={t.prompt}
                  >
                    <span className="opacity-60">{chipIcon(t.key)}</span>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mode + Count row */}
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-xs font-medium text-[#656d76] mb-1.5 block">Mode</label>
                <div className="relative">
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as IdeaMode)}
                    className="w-full appearance-none text-sm text-[#1f2328] bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0] rounded-lg pl-3 pr-7 py-2 outline-none cursor-pointer transition-colors"
                    title={MODE_DESCRIPTIONS[mode]}
                  >
                    {MODES.map(m => (
                      <option key={m} value={m}>{MODE_LABELS[m]}</option>
                    ))}
                  </select>
                  <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
                <p className="text-xs text-[#656d76]/70 mt-1">{MODE_DESCRIPTIONS[mode]}</p>
              </div>

              <div className="w-24 shrink-0">
                <label className="text-xs font-medium text-[#656d76] mb-1.5 block">Ideas</label>
                <div className="relative">
                  <select
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-full appearance-none text-sm text-[#1f2328] bg-[#f6f8fa] hover:bg-[#eef1f6] border border-[#d1d9e0] rounded-lg pl-3 pr-7 py-2 outline-none cursor-pointer transition-colors"
                  >
                    {COUNT_OPTIONS.map(n => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>
                  <svg className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Footer with generate button */}
          <div className="px-5 pt-4 pb-5">
            <button
              onClick={handleSubmit}
              disabled={disabled || noFiles}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#d1d9e0] disabled:cursor-not-allowed rounded-lg px-4 py-2.5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              {noFiles ? "Select spec files to generate" : `Generate ${count} idea${count !== 1 ? "s" : ""}`}
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
