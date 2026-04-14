import { useCallback, useEffect, useRef, useState } from "react";

interface ResizeHandleProps {
  /** Current width in px */
  width: number;
  /** Called continuously during drag with the new width */
  onResize: (width: number) => void;
  /** Minimum width in px (default 120) */
  minWidth?: number;
  /** Maximum width in px (default 600) */
  maxWidth?: number;
  /** Orientation — "vertical" means the handle is a vertical bar between left/right panels */
  direction?: "vertical";
}

export function ResizeHandle({
  width,
  onResize,
  minWidth = 120,
  maxWidth = 600,
}: ResizeHandleProps) {
  const [dragging, setDragging] = useState(false);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      startXRef.current = e.clientX;
      startWidthRef.current = width;
      setDragging(true);
    },
    [width],
  );

  useEffect(() => {
    if (!dragging) return;

    function onMouseMove(e: MouseEvent) {
      const delta = e.clientX - startXRef.current;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidthRef.current + delta));
      onResize(newWidth);
    }

    function onMouseUp() {
      setDragging(false);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    // Prevent text selection while dragging
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [dragging, minWidth, maxWidth, onResize]);

  return (
    <div
      onMouseDown={onMouseDown}
      className={`shrink-0 w-[3px] -ml-px cursor-col-resize transition-colors hover:bg-[#0969da]/40 ${
        dragging ? "bg-[#0969da]/40" : "bg-transparent"
      }`}
      style={{ touchAction: "none" }}
    />
  );
}
