import { useCallback, useEffect, useRef, useState } from "react";

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className ?? "w-3.5 h-3.5"} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  );
}

function RowCopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { void navigator.clipboard.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
      title={copied ? "Copied!" : "Copy"}
      className={`shrink-0 p-0.5 rounded transition-colors opacity-0 group-hover/row:opacity-100 ${copied ? "text-[#1a7f37]" : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6]"}`}
    >
      {copied ? <CheckIcon className="w-3 h-3" /> : <CopyIcon className="w-3 h-3" />}
    </button>
  );
}

interface Props {
  headers: Record<string, string>;
  /** Header keys whose values should be masked (e.g. Authorization) */
  maskKeys?: string[];
}

const STORAGE_KEY = "headers_table_key_width";

/**
 * Two-column table for HTTP headers with a resizable divider between
 * key and value columns. Column width is persisted across sessions.
 */
export function HeadersTable({ headers, maskKeys = [] }: Props) {
  const [keyWidth, setKeyWidth] = useState(() => {
    try { const v = parseInt(localStorage.getItem(STORAGE_KEY) ?? ""); return v > 0 ? v : 180; } catch { return 180; }
  });
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(keyWidth)); } catch { /* ignore */ }
  }, [keyWidth]);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startW.current = keyWidth;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [keyWidth]);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!dragging.current) return;
      const tableW = tableRef.current?.clientWidth ?? 600;
      const delta = e.clientX - startX.current;
      const newW = Math.min(tableW - 80, Math.max(80, startW.current + delta));
      setKeyWidth(newW);
    }
    function onMouseUp() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    }
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  const maskSet = new Set(maskKeys.map((k) => k.toLowerCase()));
  const entries = Object.entries(headers);

  function maskValue(key: string, value: string): string {
    if (maskSet.has(key.toLowerCase())) return value.slice(0, 12) + "••••••";
    return value;
  }

  return (
    <div ref={tableRef} className="w-full">
      {/* Column headers */}
      <div className="flex items-center bg-[#f6f8fa] border-b border-[#d1d9e0] text-sm font-semibold text-[#656d76] uppercase tracking-wider">
        <div className="shrink-0 px-3 py-1.5" style={{ width: keyWidth }}>Key</div>
        {/* Resize handle */}
        <div
          onMouseDown={onMouseDown}
          className="shrink-0 w-[5px] self-stretch cursor-col-resize flex justify-center group hover:bg-[#0969da]/10"
        >
          <div className="w-px h-full bg-[#d1d9e0] group-hover:bg-[#0969da]/40" />
        </div>
        <div className="flex-1 px-3 py-1.5">Value</div>
      </div>
      {/* Rows */}
      <div className="divide-y divide-[#d1d9e0]">
        {entries.map(([key, value]) => (
          <div key={key} className="flex items-start group/row hover:bg-[#f6f8fa] transition-colors">
            <div className="shrink-0 px-3 py-1.5 text-sm font-mono font-medium text-[#0969da] truncate" style={{ width: keyWidth }} title={key}>
              {key}
            </div>
            <div className="shrink-0 w-[5px] self-stretch" />
            <div className="flex-1 px-3 py-1.5 text-sm font-mono text-[#1f2328] break-all min-w-0">
              {maskValue(key, value)}
            </div>
            <div className="shrink-0 pr-2 py-1.5">
              <RowCopyButton value={`${key}: ${value}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
