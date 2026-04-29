import { useState } from "react";
import type { IdeaMode, IdeaScope } from "../../lib/api/specFilesApi";
import { IDEA_TEMPLATES } from "../../lib/ideaTemplates";

const MODE_OPTIONS: { value: IdeaMode; label: string; tip: string }[] = [
  { value: "full", label: "Full", tip: "Creates prerequisites, runs tests, tears down everything" },
  { value: "no-prereqs", label: "Partial", tip: "Uses {{proj.*}} variables for prerequisites, includes teardown" },
  { value: "no-prereqs-no-teardown", label: "Minimal", tip: "No prerequisites, no teardown — quick smoke tests" },
];

const SCOPE_OPTIONS: { value: IdeaScope; label: string }[] = [
  { value: "folder", label: "This folder" },
  { value: "version", label: "This version" },
];

const COUNT_OPTIONS = [1, 3, 5];

interface Props {
  currentMode: IdeaMode;
  onGenerate: (opts: { prompt?: string; scope: IdeaScope; count: number; mode: IdeaMode }) => void;
  onClose: () => void;
  disabled?: boolean;
  /** Whether the current context is a version-level folder (e.g., "v3/") */
  isVersionRoot?: boolean;
}

export function SmartIdeasPanel({ currentMode, onGenerate, onClose, disabled, isVersionRoot }: Props) {
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<IdeaScope>(isVersionRoot ? "version" : "folder");
  const [mode, setMode] = useState<IdeaMode>(currentMode);
  const [count, setCount] = useState(5);

  function handleGenerate() {
    onGenerate({
      prompt: prompt.trim() || undefined,
      scope,
      count,
      mode,
    });
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328] flex-1">New Ideas</span>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Prompt textarea */}
        <div>
          <label className="text-sm font-medium text-[#1f2328] block mb-1.5">
            Focus prompt <span className="font-normal text-[#656d76]">(optional)</span>
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what you want to test... Leave empty for general ideas."
            rows={3}
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
                onClick={() => setPrompt(t.prompt)}
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

        {/* Scope selector */}
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

        {/* Mode + Count row */}
        <div className="flex gap-4">
          {/* Mode */}
          <div className="flex-1">
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Mode</label>
            <div className="inline-flex rounded-md border border-[#d1d9e0] overflow-hidden">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  title={opt.tip}
                  className={`text-sm font-medium px-2.5 py-1.5 transition-colors border-r border-[#d1d9e0] last:border-r-0 ${
                    mode === opt.value
                      ? "bg-[#ddf4ff] text-[#0969da]"
                      : "bg-white text-[#656d76] hover:bg-[#f6f8fa]"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Count */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-1.5">Count</label>
            <div className="inline-flex rounded-md border border-[#d1d9e0] overflow-hidden">
              {COUNT_OPTIONS.map((n) => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`text-sm font-medium px-3 py-1.5 transition-colors border-r border-[#d1d9e0] last:border-r-0 min-w-[36px] ${
                    count === n
                      ? "bg-[#ddf4ff] text-[#0969da]"
                      : "bg-white text-[#656d76] hover:bg-[#f6f8fa]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-4 py-3 flex justify-end gap-2">
        <button
          onClick={onClose}
          className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleGenerate}
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
  );
}
