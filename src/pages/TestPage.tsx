import { useRef, useState, useEffect } from "react";
import { Layout } from "../components/common/Layout";
import { TestExplorer } from "../components/explorer/TestExplorer";
import { ResultsPanel } from "../components/results/ResultsPanel";
import { SummaryDrawer } from "../components/results/SummaryDrawer";
import { DetailPane } from "../components/results/DetailPane";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useRunnerStore } from "../store/runner.store";
import { useSpecStore } from "../store/spec.store";
import { getAllTests } from "../lib/tests/registry";

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
  const parsedTags = useSpecStore((s) => s.parsedTags);

  // Auto-select the first test once tests are loaded
  useEffect(() => {
    if (selectedTestId) return;
    if (parsedTags.length === 0) return;
    const allTests = getAllTests();
    if (allTests.length > 0) {
      selectTest(allTests[0].id);
    }
  }, [parsedTags, selectedTestId, selectTest]);

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
        <div className="flex flex-1 overflow-hidden min-h-0">
          {/* LHS sidebar */}
          <aside
            style={{ width: sidebarWidth }}
            className="border-r border-[#d1d9e0] bg-white flex flex-col overflow-hidden shrink-0"
          >
            <TestExplorer />
          </aside>

          {/* LHS drag handle */}
          <div
            onMouseDown={onLhsMouseDown}
            className="w-[3px] shrink-0 cursor-col-resize bg-[#d1d9e0]/40 hover:bg-[#0969da]/40 transition-colors active:bg-[#0969da]/60"
          />

          {/* Main results area */}
          <div className="flex-1 overflow-hidden min-w-0">
            <ResultsPanel />
          </div>

          {/* RHS drag handle */}
          <div
            onMouseDown={onRhsMouseDown}
            className="w-[3px] shrink-0 cursor-col-resize bg-[#d1d9e0]/40 hover:bg-[#0969da]/40 transition-colors active:bg-[#0969da]/60"
          />

          {/* RHS detail pane */}
          <div style={{ width: detailWidth }} className="shrink-0 overflow-hidden">
            <DetailPane testId={selectedTestId} onClose={() => selectTest(null)} />
          </div>
        </div>

        <SummaryDrawer />
      </div>
    </Layout>
  );
}
