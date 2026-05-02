import { useState, useRef, useEffect } from "react";
import { generateTitle } from "../../lib/api/flowApi";

interface CustomPromptModalProps {
  onSubmit: (title: string, prompt: string) => void;
  onClose: () => void;
}

const EXAMPLE_PROMPT = `Title: Article settings configuration and SEO optimization
Description: Creates article, configures comprehensive settings including tags, SEO metadata, and related articles
Entities: articles

Steps:
  1. POST /v3/projects/{project_id}/articles
  2. PATCH /v3/projects/{project_id}/articles/{article_id}/settings
  3. GET /v3/projects/{project_id}/articles/{article_id}/settings`;

export function CustomPromptModal({ onSubmit, onClose }: CustomPromptModalProps) {
  const [prompt, setPrompt] = useState("");
  const [aiTitleLoading, setAiTitleLoading] = useState(false);
  const titleAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { titleAbortRef.current?.abort(); };
  }, []);

  async function requestAiTitle(text: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed || trimmed.length < 20) {
      return trimmed.split("\n")[0].slice(0, 80);
    }
    titleAbortRef.current?.abort();
    const ctrl = new AbortController();
    titleAbortRef.current = ctrl;
    setAiTitleLoading(true);
    try {
      return await generateTitle(trimmed, ctrl.signal);
    } catch (e) {
      if (!ctrl.signal.aborted) console.warn("AI title generation failed:", e);
      return trimmed.split("\n")[0].slice(0, 80);
    } finally {
      if (!ctrl.signal.aborted) setAiTitleLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
          <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
          </div>
          <span className="text-base font-semibold text-[#1f2328] flex-1">New flow from custom prompt</span>
          <button onClick={onClose} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-3 space-y-3 overflow-y-auto">
          <p className="text-sm text-[#656d76] leading-relaxed">
            Describe the flow you want to generate. A title will be generated automatically from your prompt.
          </p>
          {aiTitleLoading && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] border border-[#d1d9e0] rounded-md min-h-[36px]">
              <svg className="w-3.5 h-3.5 text-[#8250df] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
              <span className="flex items-center gap-1.5 text-sm text-[#656d76]">
                <svg className="w-3.5 h-3.5 animate-spin text-[#8250df]" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Generating title…
              </span>
            </div>
          )}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-sm font-medium text-[#1f2328]">Prompt</label>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setPrompt(EXAMPLE_PROMPT)}
                  className="text-sm font-medium text-[#0969da] hover:underline"
                >
                  Insert example
                </button>
                {prompt && (
                  <button
                    type="button"
                    onClick={() => {
                      setPrompt("");
                      setAiTitleLoading(false);
                      titleAbortRef.current?.abort();
                    }}
                    className="text-sm font-medium text-[#656d76] hover:text-[#d1242f] hover:underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={12}
              autoFocus
              placeholder={"Describe the scenario flow...\n\nExample:\nCreate and publish an article with category,\nconfigures SEO settings, then verify the article\nis accessible via GET.\n\nSteps:\n  1. POST /v3/projects/{project_id}/categories\n  2. POST /v3/projects/{project_id}/articles\n  3. PATCH /v3/projects/{project_id}/articles/{article_id}"}
              className="w-full text-sm font-mono border border-[#d1d9e0] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] resize-y leading-relaxed"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
          <button
            onClick={() => {
              titleAbortRef.current?.abort();
              onClose();
            }}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!prompt.trim() || aiTitleLoading}
            onClick={async () => {
              const text = prompt.trim();
              const title = await requestAiTitle(text);
              onSubmit(title, text);
              onClose();
            }}
            className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] border border-[#1f883d]/80 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {aiTitleLoading ? "Generating title…" : "Generate flow"}
          </button>
        </div>
      </div>
    </div>
  );
}
