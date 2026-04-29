import { useState } from "react";
import type { IdeaMode, IdeaScope } from "../../lib/api/specFilesApi";
import { IDEA_TEMPLATES } from "../../lib/ideaTemplates";

interface Props {
  onGenerate: (count: number, mode: IdeaMode, prompt?: string, scope?: IdeaScope) => void;
  onClose: () => void;
  currentMode: IdeaMode;
  disabled?: boolean;
  /** Show scope selector (folder vs version) */
  showScope?: boolean;
  /** Whether the current context is already a version-level folder */
  isVersionRoot?: boolean;
  /** Whether user has multi-selected specific files */
  hasFileSelection?: boolean;
}

const MODE_OPTIONS: { value: IdeaMode; label: string; description: string }[] = [
  {
    value: "full",
    label: "Full lifecycle",
    description: "Creates prerequisite entities (e.g., parent category before an article), runs the core test operations, then tears down everything. Best for integration tests and CI pipelines.",
  },
  {
    value: "no-prereqs",
    label: "Partial",
    description: "Skips prerequisite creation — references parent entities via {{proj.*}} project variables configured in Settings → Variables. Includes teardown for resources the flow creates.",
  },
  {
    value: "no-prereqs-no-teardown",
    label: "Minimal",
    description: "No prerequisite creation and no teardown. Uses {{proj.*}} variables for dependencies and leaves created resources in place. Best for quick smoke tests.",
  },
];

const COUNT_OPTIONS = [1, 2, 3, 5, 10];

const SCOPE_OPTIONS: { value: IdeaScope; label: string }[] = [
  { value: "folder", label: "This folder" },
  { value: "version", label: "Entire version" },
];

export function GenerateIdeasModal({ onGenerate, onClose, currentMode, disabled, showScope, isVersionRoot, hasFileSelection }: Props) {
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<IdeaMode>(currentMode);
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<IdeaScope>(isVersionRoot ? "version" : "folder");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[480px] max-w-[90vw] max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0] shrink-0">
          <svg className="w-5 h-5 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
          </svg>
          <span className="text-base font-semibold text-[#1f2328] flex-1">Generate Ideas</span>
          <button onClick={onClose} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          {/* Focus prompt */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">
              Focus prompt <span className="font-normal text-[#656d76]">(optional)</span>
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe what you want to test... Leave empty for general ideas."
              rows={2}
              className="w-full text-sm border border-[#d1d9e0] rounded-md px-3 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 resize-none text-[#1f2328] placeholder:text-[#afb8c1]"
            />
          </div>

          {/* Template chips */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Quick templates</label>
            <div className="flex flex-wrap gap-1.5">
              {IDEA_TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setPrompt(prompt === t.prompt ? "" : t.prompt)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                    prompt === t.prompt
                      ? "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]"
                      : "bg-white text-[#656d76] border-[#d1d9e0] hover:bg-[#f6f8fa] hover:text-[#1f2328]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scope + Count row */}
          <div className="flex gap-4 items-end">
            {/* Scope */}
            {showScope && !hasFileSelection && (
              <div>
                <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Scope</label>
                <div className="inline-flex rounded-md border border-[#d1d9e0] overflow-hidden">
                  {SCOPE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setScope(opt.value)}
                      className={`text-sm font-medium px-3 py-1.5 transition-colors border-r border-[#d1d9e0] last:border-r-0 ${
                        scope === opt.value
                          ? "bg-[#ddf4ff] text-[#0969da]"
                          : "bg-white text-[#656d76] hover:bg-[#f6f8fa]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Count dropdown */}
            <div>
              <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Ideas</label>
              <select
                value={count}
                onChange={(e) => setCount(Number(e.target.value))}
                className="text-sm font-medium border border-[#d1d9e0] rounded-md px-2.5 py-1.5 bg-white text-[#1f2328] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 cursor-pointer"
              >
                {COUNT_OPTIONS.map(n => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Mode selector — radio cards with inline description */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Mode</label>
            <div className="space-y-1.5">
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-2.5 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                    mode === opt.value
                      ? "bg-[#ddf4ff] border-[#b6e3ff]"
                      : "bg-white border-[#d1d9e0] hover:bg-[#f6f8fa]"
                  }`}
                >
                  <input
                    type="radio"
                    name="ideaMode"
                    checked={mode === opt.value}
                    onChange={() => setMode(opt.value)}
                    className="mt-0.5 accent-[#0969da] shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[#1f2328]">{opt.label}</span>
                    <p className="text-xs text-[#656d76] mt-0.5 leading-relaxed">{opt.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onGenerate(count, mode, prompt.trim() || undefined, showScope ? scope : undefined);
              onClose();
            }}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:opacity-50 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors border border-[#0969da]/80"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            Generate {count} idea{count !== 1 ? "s" : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
