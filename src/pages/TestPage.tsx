import { useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { TestExplorer } from "../components/explorer/TestExplorer";
import { ResultsPanel } from "../components/results/ResultsPanel";
import { SummaryDrawer } from "../components/results/SummaryDrawer";
import { DetailPane } from "../components/results/DetailPane";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useRunnerStore } from "../store/runner.store";

const LHS_MIN = 180;
const LHS_MAX = 520;
const RHS_MIN = 280;
const RHS_MAX = 640;

export function TestPage() {
  useAuthGuard();
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const [detailWidth, setDetailWidth] = useState(384);
  const lhsDragging = useRef(false);
  const rhsDragging = useRef(false);
  const { selectedTestId, selectTest } = useRunnerStore();

  function onLhsMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    lhsDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      if (!lhsDragging.current) return;
      setSidebarWidth(Math.min(LHS_MAX, Math.max(LHS_MIN, ev.clientX)));
    }
    function onUp() {
      lhsDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function onRhsMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    rhsDragging.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      if (!rhsDragging.current) return;
      // width = distance from drag handle to right edge of window
      setDetailWidth(Math.min(RHS_MAX, Math.max(RHS_MIN, window.innerWidth - ev.clientX)));
    }
    function onUp() {
      rhsDragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  return (
    <Layout showTestControls>
      <div className="flex flex-col h-full">

        {/* ── Three-column area ── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* LHS sidebar */}
          <aside
            style={{ width: sidebarWidth }}
            className="border-r border-gray-200 bg-white flex flex-col overflow-hidden shrink-0"
          >
            <TestExplorer />
          </aside>

          {/* LHS drag handle */}
          <div
            onMouseDown={onLhsMouseDown}
            className="w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors active:bg-blue-500"
          />

          {/* Main results area */}
          <div className="flex-1 overflow-hidden min-w-0">
            <ResultsPanel />
          </div>

          {/* RHS drag handle */}
          {selectedTestId && (
            <div
              onMouseDown={onRhsMouseDown}
              className="w-1 shrink-0 cursor-col-resize bg-gray-200 hover:bg-blue-400 transition-colors active:bg-blue-500"
            />
          )}

          {/* RHS detail pane */}
          {selectedTestId && (
            <div style={{ width: detailWidth }} className="shrink-0 overflow-hidden">
              <DetailPane testId={selectedTestId} onClose={() => selectTest(null)} />
            </div>
          )}
        </div>

        {/* ── Summary drawer spans full width ── */}
        <SummaryDrawer />
      </div>
    </Layout>
  );
}
