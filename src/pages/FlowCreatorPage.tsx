import { useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { XmlViewer } from "../components/flowcreator/XmlViewer";
import { generateFlowStream } from "../lib/api/flowApi";
import { useAuthGuard } from "../hooks/useAuthGuard";

const EXAMPLE_PROMPTS = [
  "Create a category lifecycle flow: create → verify → delete",
  "Create a drive file upload flow: upload file → verify → delete",
  "Create an article settings flow: get settings → update → verify → restore",
];

export function FlowCreatorPage() {
  useAuthGuard();

  const [prompt, setPrompt] = useState("");
  const [xml, setXml] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  async function handleGenerate() {
    if (!prompt.trim() || streaming) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setXml("");
    setError(null);
    setStreaming(true);

    try {
      await generateFlowStream(
        prompt.trim(),
        [],
        (chunk) => setXml((prev) => prev + chunk),
        ctrl.signal
      );
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      void handleGenerate();
    }
  }

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* ── Left panel ── */}
        <aside className="w-72 shrink-0 border-r border-gray-200 bg-white flex flex-col gap-4 p-4 overflow-y-auto">
          {/* Prompt */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Describe the flow
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="e.g. Create a flow that tests the full article lifecycle: create category → create article → publish → fork → verify draft → delete draft → delete article → delete category"
              rows={7}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none leading-relaxed"
            />
            <p className="text-xs text-gray-400">Ctrl+Enter to generate</p>
          </div>

          {/* Example prompts */}
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Examples</span>
            {EXAMPLE_PROMPTS.map((p) => (
              <button
                key={p}
                onClick={() => setPrompt(p)}
                className="text-left text-xs text-blue-600 hover:text-blue-800 hover:underline leading-snug"
              >
                {p}
              </button>
            ))}
          </div>

          {/* Generate / Stop */}
          <div className="mt-auto pt-2">
            {streaming ? (
              <button
                onClick={handleStop}
                className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="6" width="12" height="12" rx="2" />
                </svg>
                Stop
              </button>
            ) : (
              <button
                onClick={() => void handleGenerate()}
                disabled={!prompt.trim()}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                </svg>
                Generate Flow
              </button>
            )}
            {error && (
              <p className="mt-2 text-xs text-red-500 bg-red-50 rounded px-2 py-1">{error}</p>
            )}
          </div>
        </aside>

        {/* ── Right panel ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <XmlViewer xml={xml} streaming={streaming} />
        </div>
      </div>
    </Layout>
  );
}
