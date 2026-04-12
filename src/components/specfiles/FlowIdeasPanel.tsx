import type { FlowIdea, FlowIdeasUsage } from "../../lib/api/specFilesApi";

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "bg-green-100 text-green-700",
  moderate: "bg-yellow-100 text-yellow-700",
  complex: "bg-orange-100 text-orange-700",
};

interface Props {
  ideas: FlowIdea[] | null;
  usage: FlowIdeasUsage | null;
  loading: boolean;
  error: string | null;
  rawText?: string;
  selectedIds: Set<string>;
  activeIdeaId: string | null;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onGenerateFlows: () => void;
  onGenerateMore: () => void;
  onClickIdea: (id: string) => void;
  generatingFlows: boolean;
}

export function FlowIdeasPanel({
  ideas, usage, loading, error, rawText,
  selectedIds, activeIdeaId, onToggleSelect, onSelectAll, onDeselectAll,
  onGenerateFlows, onGenerateMore, onClickIdea, generatingFlows,
}: Props) {
  const totalIdeas = ideas?.length ?? 0;
  const selectedCount = selectedIds.size;
  const allSelected = totalIdeas > 0 && selectedCount === totalIdeas;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <span className="text-xs font-semibold text-gray-700">Ideas</span>
        {totalIdeas > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">{totalIdeas}</span>
        )}
        <div className="flex-1" />
        {totalIdeas > 0 && (
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            className="text-[10px] text-blue-500 hover:text-blue-700"
          >
            {allSelected ? "Deselect all" : "Select all"}
          </button>
        )}
      </div>

      {/* Usage stats */}
      {usage && (
        <div className="flex items-center gap-2 px-3 py-1 border-b border-gray-100 bg-gray-50/50 text-[10px] text-gray-400 shrink-0">
          <span>{usage.filesAnalyzed} files</span>
          <span>·</span>
          <span>{usage.inputTokens.toLocaleString()} in + {usage.outputTokens.toLocaleString()} out</span>
          <span>·</span>
          <span className="font-medium text-gray-500">${usage.costUsd.toFixed(4)}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg className="w-6 h-6 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-xs text-gray-500">Generating ideas...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="m-3 bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-red-700 font-medium">Generation failed</p>
            <p className="text-[10px] text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Raw text fallback */}
        {!loading && !error && rawText && (
          <div className="m-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-700 font-medium mb-1">Could not parse ideas:</p>
            <pre className="text-[10px] text-gray-700 whitespace-pre-wrap font-mono bg-white rounded p-2 border border-yellow-100 max-h-40 overflow-y-auto">{rawText}</pre>
          </div>
        )}

        {/* Ideas list */}
        {!loading && !error && ideas && ideas.length > 0 && (
          <div className="py-1">
            {ideas.map((idea) => {
              const isChecked = selectedIds.has(idea.id);
              const isActive = activeIdeaId === idea.id;
              return (
                <div
                  key={idea.id}
                  className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isActive
                      ? "border-l-purple-500 bg-purple-50/50"
                      : isChecked
                        ? "border-l-blue-300 bg-blue-50/30 hover:bg-blue-50/50"
                        : "border-l-transparent hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelect(idea.id)}
                    className="mt-0.5 accent-blue-600 shrink-0"
                  />
                  <button
                    onClick={() => onClickIdea(idea.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-800 truncate">{idea.title}</span>
                      <span className={`text-[9px] px-1 py-0.5 rounded-full font-medium shrink-0 ${COMPLEXITY_COLORS[idea.complexity] ?? "bg-gray-100 text-gray-600"}`}>
                        {idea.complexity}
                      </span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{idea.description}</p>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && ideas && ideas.length === 0 && !rawText && (
          <div className="text-center py-12">
            <p className="text-xs text-gray-400">No flow ideas generated.</p>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!loading && ideas && ideas.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-2 flex gap-1.5">
          <button
            onClick={onGenerateMore}
            disabled={generatingFlows}
            className="flex items-center justify-center gap-1 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 text-[10px] font-medium rounded px-2 py-1.5 transition-colors disabled:opacity-40"
          >
            <svg className="w-3 h-3 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            More Ideas
          </button>
          <button
            onClick={onGenerateFlows}
            disabled={selectedCount === 0 || generatingFlows}
            className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium rounded px-3 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {selectedCount === 0 ? "Select ideas" : `Generate ${selectedCount} Flow${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
