import { useState } from "react";
import type { IdeaMode } from "../../lib/api/specFilesApi";

interface Props {
  onGenerate: (count: number, mode: IdeaMode, prompt?: string) => void;
  onClose: () => void;
  currentMode: IdeaMode;
  disabled?: boolean;
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
    description: "Skips prerequisite creation — references parent entities via {{proj.*}} project variables configured in Settings → Variables. Includes teardown for resources the flow creates. Best for clean tests against stable test data.",
  },
  {
    value: "no-prereqs-no-teardown",
    label: "Minimal",
    description: "No prerequisite creation and no teardown. Uses {{proj.*}} variables for dependencies and leaves created resources in place. Best for quick smoke tests and debugging.",
  },
];

const COUNT_OPTIONS = [1, 3, 5];

export function GenerateIdeasModal({ onGenerate, onClose, currentMode, disabled }: Props) {
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<IdeaMode>(currentMode);
  const [prompt, setPrompt] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[440px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
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

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
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

          {/* Count selector */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-2">Number of ideas</label>
            <div className="flex gap-2">
              {COUNT_OPTIONS.map(n => (
                <button
                  key={n}
                  onClick={() => setCount(n)}
                  className={`flex-1 text-sm font-medium rounded-md px-3 py-2 border transition-colors ${
                    count === n
                      ? "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]"
                      : "bg-white text-[#1f2328] border-[#d1d9e0] hover:bg-[#f6f8fa]"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Mode selector */}
          <div>
            <label className="text-sm font-medium text-[#1f2328] block mb-2">Generation mode</label>
            <div className="space-y-2">
              {MODE_OPTIONS.map(opt => (
                <label
                  key={opt.value}
                  className={`flex items-start gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors ${
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
                    className="mt-0.5 accent-[#0969da]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[#1f2328]">{opt.label}</span>
                      <span className="group relative">
                        <svg className="w-3.5 h-3.5 text-[#656d76] cursor-help" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                        </svg>
                        <span className="invisible group-hover:visible absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 bg-[#1f2328] text-white text-xs rounded-md px-3 py-2 shadow-lg z-10 leading-relaxed pointer-events-none">
                          {opt.description}
                        </span>
                      </span>
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
          <button
            onClick={onClose}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onGenerate(count, mode, prompt.trim() || undefined); onClose(); }}
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
