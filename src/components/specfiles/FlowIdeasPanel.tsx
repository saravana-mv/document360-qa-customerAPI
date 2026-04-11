import { useState } from "react";
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
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onGenerateFlows: () => void;
  onGenerateMore: () => void;
  generatingFlows: boolean;
}

export function FlowIdeasPanel({
  ideas, usage, loading, error, rawText,
  selectedIds, onToggleSelect, onSelectAll, onDeselectAll,
  onGenerateFlows, onGenerateMore, generatingFlows,
}: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totalIdeas = ideas?.length ?? 0;
  const selectedCount = selectedIds.size;
  const allSelected = totalIdeas > 0 && selectedCount === totalIdeas;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Usage stats bar */}
      {usage && (
        <div className="flex items-center gap-4 px-4 py-1.5 border-b border-gray-100 bg-gray-50 text-xs text-gray-500 shrink-0">
          <span>{usage.filesAnalyzed} files analyzed</span>
          <span className="text-gray-300">|</span>
          <span>{usage.inputTokens.toLocaleString()} in + {usage.outputTokens.toLocaleString()} out tokens</span>
          <span className="text-gray-300">|</span>
          <span className="font-medium text-gray-700">${usage.costUsd.toFixed(4)}</span>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <svg className="w-8 h-8 text-purple-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-gray-500">Analyzing specs and generating flow ideas...</p>
            <p className="text-xs text-gray-400">This may take 10-30 seconds</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700 font-medium">Generation failed</p>
            <p className="text-xs text-red-600 mt-1">{error}</p>
          </div>
        )}

        {/* Raw text fallback */}
        {!loading && !error && rawText && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-700 font-medium mb-2">Could not parse structured ideas. Raw output:</p>
            <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white rounded p-3 border border-yellow-100 max-h-96 overflow-y-auto">{rawText}</pre>
          </div>
        )}

        {/* Ideas list */}
        {!loading && !error && ideas && ideas.length > 0 && (
          <div className="space-y-2">
            {/* Selection toolbar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <p className="text-xs text-gray-500">
                  {totalIdeas} idea{totalIdeas !== 1 ? "s" : ""}
                  {selectedCount > 0 && <span className="text-blue-600 font-medium"> — {selectedCount} selected</span>}
                </p>
                <button
                  onClick={allSelected ? onDeselectAll : onSelectAll}
                  className="text-xs text-blue-500 hover:text-blue-700"
                >
                  {allSelected ? "Deselect all" : "Select all"}
                </button>
              </div>
            </div>

            {ideas.map((idea) => {
              const isExpanded = expandedId === idea.id;
              const isChecked = selectedIds.has(idea.id);
              return (
                <div
                  key={idea.id}
                  className={`border rounded-lg transition-colors ${
                    isChecked ? "border-blue-300 bg-blue-50/30" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {/* Idea header */}
                  <div className="flex items-start gap-2 px-3 py-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => onToggleSelect(idea.id)}
                      className="mt-1 accent-blue-600 shrink-0"
                    />
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : idea.id)}
                      className="flex-1 flex items-start gap-2 text-left min-w-0"
                    >
                      <svg
                        className={`w-3.5 h-3.5 mt-0.5 shrink-0 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                        fill="currentColor" viewBox="0 0 20 20"
                      >
                        <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">{idea.title}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${COMPLEXITY_COLORS[idea.complexity] ?? "bg-gray-100 text-gray-600"}`}>
                            {idea.complexity}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{idea.description}</p>
                      </div>
                    </button>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100 pt-2 ml-9">
                      <div className="mb-2">
                        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Steps</p>
                        <ol className="space-y-0.5">
                          {idea.steps.map((step, i) => (
                            <li key={i} className="flex items-center gap-2 text-xs text-gray-700">
                              <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium shrink-0">
                                {i + 1}
                              </span>
                              <code className="font-mono text-[11px]">{step}</code>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {idea.entities.length > 0 && (
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-gray-500 mr-1">Entities:</span>
                          {idea.entities.map((e) => (
                            <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{e}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Empty */}
        {!loading && !error && ideas && ideas.length === 0 && !rawText && (
          <div className="text-center py-16">
            <p className="text-sm text-gray-400">No flow ideas generated.</p>
            <p className="text-xs text-gray-400 mt-1">The folder may not contain API specifications.</p>
          </div>
        )}
      </div>

      {/* Bottom action bar — visible when ideas exist */}
      {!loading && ideas && ideas.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3 flex gap-2">
          <button
            onClick={onGenerateMore}
            disabled={generatingFlows}
            className="flex items-center justify-center gap-1.5 border border-gray-300 hover:border-gray-400 bg-white text-gray-700 text-xs font-medium rounded-lg px-3 py-2 transition-colors disabled:opacity-40"
          >
            <svg className="w-3.5 h-3.5 text-purple-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            More Ideas
          </button>
          <button
            onClick={onGenerateFlows}
            disabled={selectedCount === 0 || generatingFlows}
            className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {selectedCount === 0
              ? "Select ideas to generate flows"
              : `Generate ${selectedCount} Flow${selectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}
