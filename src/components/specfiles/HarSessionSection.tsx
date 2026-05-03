import { useState, useRef } from "react";
import { parseAndFilter, type HarParseResult } from "../../lib/harParser";

interface HarSessionSectionProps {
  harResult: HarParseResult | null;
  onHarLoaded: (result: HarParseResult) => void;
  onHarRemoved: () => void;
  /** When set, auto-filter to this URL and skip the base URL dropdown. */
  forceBaseUrl?: string;
}

export function HarSessionSection({ harResult, onHarLoaded, onHarRemoved, forceBaseUrl }: HarSessionSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rawJson, setRawJson] = useState("");
  const [selectedBase, setSelectedBase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      setRawJson(text);
      setFileName(file.name);
      const result = parseAndFilter(text, forceBaseUrl || undefined);
      setSelectedBase(result.baseUrlUsed);
      onHarLoaded(result);
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to parse HAR file");
    } finally {
      setLoading(false);
    }
  }

  function handleRefilter(baseUrl: string) {
    if (!rawJson) return;
    setSelectedBase(baseUrl);
    try {
      const result = parseAndFilter(rawJson, baseUrl);
      onHarLoaded(result);
    } catch {
      // keep existing
    }
  }

  function handleRemove() {
    setRawJson("");
    setFileName("");
    setSelectedBase("");
    setError(null);
    onHarRemoved();
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasHar = harResult !== null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-sm font-medium text-[#656d76] hover:text-[#1f2328] transition-colors mb-1.5"
      >
        <svg
          className={`w-3 h-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
        </svg>
        Session recording (HAR)
        {hasHar && (
          <span className="text-xs font-normal text-[#0969da] bg-[#ddf4ff] rounded-full px-2 py-0.5">
            {harResult.filteredEntries} calls
          </span>
        )}
      </button>

      {expanded && (
        <div className="ml-4.5 space-y-2">
          {!hasHar ? (
            <>
              <input
                ref={inputRef}
                type="file"
                accept=".har,.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const file = e.dataTransfer.files[0];
                  if (file) void handleFile(file);
                }}
                onClick={() => inputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border-2 border-dashed cursor-pointer transition-colors ${
                  dragOver
                    ? "border-[#0969da] bg-[#ddf4ff]/50"
                    : "border-[#d1d9e0] hover:border-[#afb8c1] bg-[#f6f8fa]"
                }`}
              >
                <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                <p className="text-xs text-[#656d76]">
                  {loading ? "Parsing..." : "Drop a .har file or click to browse"}
                </p>
              </div>
              {error && <p className="text-xs text-[#d1242f]">{error}</p>}
              <p className="text-xs text-[#656d76]/70">
                Record browser API calls from DevTools (Network tab → Export HAR). Auth headers and sensitive fields are auto-stripped.
              </p>
            </>
          ) : (
            <>
              {/* Loaded state */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#ddf4ff]/50 border border-[#0969da]/20">
                <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-[#1f2328] truncate">{fileName}</p>
                  <p className="text-xs text-[#656d76]">
                    {harResult.filteredEntries} of {harResult.totalEntries} entries
                  </p>
                </div>
                <button
                  onClick={handleRemove}
                  className="text-[#656d76] hover:text-[#d1242f] transition-colors p-1"
                  title="Remove"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Base URL selector — hidden when forceBaseUrl is configured */}
              {!forceBaseUrl && harResult.detectedBaseUrls.length > 1 && (
                <div>
                  <label className="text-xs text-[#656d76] block mb-1">Base URL filter</label>
                  <select
                    value={selectedBase}
                    onChange={(e) => handleRefilter(e.target.value)}
                    className="w-full text-xs text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded px-2 py-1"
                  >
                    {harResult.detectedBaseUrls.map((url) => (
                      <option key={url} value={url}>{url}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Trace preview */}
              <div className="max-h-[120px] overflow-y-auto rounded border border-[#d1d9e0] bg-[#f6f8fa] px-2 py-1.5">
                <pre className="text-xs text-[#1f2328] whitespace-pre-wrap font-mono leading-relaxed">
                  {harResult.trace.split("\n").slice(0, 15).join("\n")}
                  {harResult.trace.split("\n").length > 15 && "\n..."}
                </pre>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
