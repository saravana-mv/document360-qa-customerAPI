import { useCallback, useEffect, useRef, useState } from "react";
import { searchSpecFiles, type SpecSearchResult } from "../../lib/api/specFilesApi";

interface SearchModalProps {
  onSelectFile: (path: string) => void;
  onClose: () => void;
}

export function SearchModal({ onSelectFile, onClose }: SearchModalProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SpecSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await searchSpecFiles(q);
      setResults(res);
      setSelectedIndex(0);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleInputChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value.trim()), 300);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results.length > 0) {
      e.preventDefault();
      onSelectFile(results[selectedIndex].name);
      onClose();
    }
  }

  function handleResultClick(name: string) {
    onSelectFile(name);
    onClose();
  }

  /** Highlight matching terms in a snippet line. */
  function highlightSnippet(text: string): React.ReactNode {
    if (!query.trim()) return text;
    const terms = query.trim().split(/\s+/).filter(Boolean);
    const pattern = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const regex = new RegExp(`(${pattern})`, "gi");
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part)
        ? <mark key={i} className="bg-[#fff8c5] text-[#1f2328] rounded-sm px-0.5">{part}</mark>
        : part
    );
  }

  /** Extract filename from full path for display. */
  function displayPath(name: string) {
    const parts = name.split("/");
    const file = parts.pop() ?? name;
    const folder = parts.join("/");
    return { folder, file };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-2xl border border-[#d1d9e0] w-full max-w-[600px] max-h-[60vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
          <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search spec files..."
            className="flex-1 text-sm text-[#1f2328] placeholder-[#656d76] outline-none bg-transparent"
          />
          {loading && (
            <svg className="w-4 h-4 text-[#656d76] animate-spin shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
          )}
          <kbd className="hidden sm:inline text-[10px] text-[#656d76] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-1.5 py-0.5 font-mono">ESC</kbd>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="px-4 py-3 text-sm text-[#d1242f]">{error}</div>
          )}

          {!loading && query.length >= 2 && results.length === 0 && !error && (
            <div className="px-4 py-8 text-center text-sm text-[#656d76]">No results found</div>
          )}

          {query.length > 0 && query.length < 2 && (
            <div className="px-4 py-8 text-center text-sm text-[#656d76]">Type at least 2 characters to search</div>
          )}

          {results.map((result, i) => {
            const { folder, file } = displayPath(result.name);
            return (
              <button
                key={result.name}
                onClick={() => handleResultClick(result.name)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`w-full text-left px-4 py-2.5 border-b border-[#d1d9e0]/50 transition-colors ${
                  i === selectedIndex ? "bg-[#ddf4ff]" : "hover:bg-[#f6f8fa]"
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                  </svg>
                  {folder && <span className="text-xs text-[#656d76]">{folder}/</span>}
                  <span className="text-sm font-medium text-[#0969da]">{file}</span>
                </div>
                {result.matches.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {result.matches.slice(0, 2).map((match, j) => (
                      <p key={j} className="text-sm text-[#656d76] truncate pl-5">
                        {highlightSnippet(match)}
                      </p>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer hint */}
        {results.length > 0 && (
          <div className="flex items-center gap-3 px-4 py-2 border-t border-[#d1d9e0] bg-[#f6f8fa] text-[10px] text-[#656d76]">
            <span><kbd className="font-mono bg-white border border-[#d1d9e0] rounded px-1 py-0.5">↑↓</kbd> navigate</span>
            <span><kbd className="font-mono bg-white border border-[#d1d9e0] rounded px-1 py-0.5">↵</kbd> open</span>
            <span><kbd className="font-mono bg-white border border-[#d1d9e0] rounded px-1 py-0.5">esc</kbd> close</span>
          </div>
        )}
      </div>
    </div>
  );
}
