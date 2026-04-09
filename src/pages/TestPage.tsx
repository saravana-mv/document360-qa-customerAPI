import { useState, useRef } from "react";
import { Layout } from "../components/common/Layout";
import { TestExplorer } from "../components/explorer/TestExplorer";
import { ResultsPanel } from "../components/results/ResultsPanel";
import { SummaryDrawer } from "../components/results/SummaryDrawer";
import { DiffModal } from "../components/results/DiffModal";
import { useAuthGuard } from "../hooks/useAuthGuard";

const MIN_WIDTH = 180;
const MAX_WIDTH = 520;

export function TestPage() {
  useAuthGuard();
  const [diffOpen, setDiffOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(288); // default w-72
  const isDragging = useRef(false);

  function handleRunSelected() {
    window.dispatchEvent(new CustomEvent("run-selected"));
  }

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    isDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMouseMove(ev: MouseEvent) {
      if (!isDragging.current) return;
      setSidebarWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, ev.clientX)));
    }

    function onMouseUp() {
      isDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  }

  return (
    <Layout
      showTestControls
      onCheckChanges={() => setDiffOpen(true)}
      onRunSelected={handleRunSelected}
    >
      <div className="flex h-full">
        {/* Sidebar */}
        <aside
          style={{ width: sidebarWidth }}
          className="border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden shrink-0"
        >
          <TestExplorer />
        </aside>

        {/* Drag handle */}
        <div
          onMouseDown={onDividerMouseDown}
          className="w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors active:bg-blue-500"
          title="Drag to resize"
        />

        {/* Main */}
        <div className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
          <ResultsPanel />
          <SummaryDrawer />
        </div>
      </div>

      <DiffModal open={diffOpen} onClose={() => setDiffOpen(false)} />
    </Layout>
  );
}
