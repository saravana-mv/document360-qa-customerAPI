import { useCallback, useEffect, useRef, useState } from "react";

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
      <div className="flex items-center bg-[#f6f8fa] border-b border-[#d1d9e0] text-xs font-semibold text-[#656d76] uppercase tracking-wider">
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
            <div className="shrink-0 px-3 py-1.5 text-xs font-mono font-medium text-[#0969da] truncate" style={{ width: keyWidth }} title={key}>
              {key}
            </div>
            <div className="shrink-0 w-[5px] self-stretch" />
            <div className="flex-1 px-3 py-1.5 text-xs font-mono text-[#1f2328] break-all min-w-0">
              {maskValue(key, value)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
