import { useState, useRef, useEffect } from "react";
import { parseAndFilter, type HarParseResult } from "../../../lib/harParser";

interface HarUploadPillProps {
  harResult: HarParseResult | null;
  onHarLoaded: (result: HarParseResult) => void;
  onHarRemoved: () => void;
}

export function HarUploadPill({ harResult, onHarLoaded, onHarRemoved }: HarUploadPillProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [fileName, setFileName] = useState<string>("");
  const [rawJson, setRawJson] = useState<string>("");
  const [selectedBase, setSelectedBase] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);

  // Close preview on click-outside
  useEffect(() => {
    if (!showPreview) return;
    function handleMouseDown(e: MouseEvent) {
      if (previewRef.current && !previewRef.current.contains(e.target as Node)) {
        setShowPreview(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [showPreview]);

  async function handleFile(file: File) {
    setError(null);
    setLoading(true);
    try {
      const text = await file.text();
      setRawJson(text);
      setFileName(file.name);
      const result = parseAndFilter(text);
      setSelectedBase(result.baseUrlUsed);
      onHarLoaded(result);
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
      // keep existing result
    }
  }

  function handleRemove(e: React.MouseEvent) {
    e.stopPropagation();
    setRawJson("");
    setFileName("");
    setSelectedBase("");
    setShowPreview(false);
    onHarRemoved();
    if (inputRef.current) inputRef.current.value = "";
  }

  const hasHar = harResult !== null;

  return (
    <div className="relative">
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

      <button
        onClick={() => {
          if (hasHar) {
            setShowPreview((v) => !v);
          } else {
            inputRef.current?.click();
          }
        }}
        disabled={loading}
        className={`inline-flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 border transition-colors ${
          error
            ? "text-[#d1242f] bg-[#ffebe9] border-[#d1242f]/20"
            : hasHar
              ? "text-[#0969da] bg-[#ddf4ff] border-[#0969da]/20 hover:bg-[#b6e3ff]"
              : "text-[#656d76] bg-[#f6f8fa] border-[#d1d9e0]/70 hover:bg-[#eef1f6] hover:text-[#1f2328]"
        }`}
        title={error ?? (hasHar ? `${fileName} — click to preview` : "Upload HAR recording")}
      >
        {/* Network/signal icon */}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
        </svg>
        {loading ? "Parsing..." : hasHar ? `${harResult.filteredEntries} calls` : "HAR"}
        {hasHar && (
          <span
            onClick={handleRemove}
            className="ml-0.5 hover:text-[#d1242f] cursor-pointer"
            title="Remove HAR"
          >
            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </span>
        )}
      </button>

      {/* Preview popover */}
      {showPreview && harResult && (
        <div
          ref={previewRef}
          className="absolute left-0 bottom-full mb-1 z-20 w-[380px] bg-white rounded-lg shadow-lg border border-[#d1d9e0] overflow-hidden"
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-[#d1d9e0] bg-[#f6f8fa]">
            <p className="text-sm font-medium text-[#1f2328] truncate">{fileName}</p>
            <p className="text-xs text-[#656d76] mt-0.5">
              {harResult.totalEntries} total entries, {harResult.filteredEntries} API calls filtered
            </p>
          </div>

          {/* Base URL selector */}
          {harResult.detectedBaseUrls.length > 1 && (
            <div className="px-3 py-2 border-b border-[#d1d9e0]">
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
          <div className="px-3 py-2 max-h-[200px] overflow-y-auto">
            <pre className="text-xs text-[#1f2328] whitespace-pre-wrap font-mono leading-relaxed">
              {harResult.trace.split("\n").slice(0, 30).join("\n")}
              {harResult.trace.split("\n").length > 30 && "\n..."}
            </pre>
          </div>

          {/* Footer note */}
          <div className="px-3 py-1.5 border-t border-[#d1d9e0] bg-[#f6f8fa]">
            <p className="text-xs text-[#656d76]">This trace will be sent to the AI model</p>
          </div>
        </div>
      )}
    </div>
  );
}
