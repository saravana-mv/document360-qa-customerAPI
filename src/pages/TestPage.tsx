import { useEffect, useState } from "react";
import { Layout } from "../components/common/Layout";
import { TestExplorer } from "../components/explorer/TestExplorer";
import { ResultsPanel } from "../components/results/ResultsPanel";
import { SummaryDrawer } from "../components/results/SummaryDrawer";
import { DetailPane } from "../components/results/DetailPane";
import { RunHistory } from "../components/results/RunHistory";
import { useRunnerStore } from "../store/runner.store";
import { useSpecStore } from "../store/spec.store";
import { getAllTests } from "../lib/tests/registry";

type Tab = "tests" | "history";

export function TestPage() {
  const { selectedTestId, selectTest } = useRunnerStore();
  const parsedTags = useSpecStore((s) => s.parsedTags);
  const [tab, setTab] = useState<Tab>("tests");

  // Auto-select the first test once tests are loaded
  useEffect(() => {
    if (selectedTestId) return;
    if (parsedTags.length === 0) return;
    const allTests = getAllTests();
    if (allTests.length > 0) {
      selectTest(allTests[0].id);
    }
  }, [parsedTags, selectedTestId, selectTest]);

  const hasTests = parsedTags.length > 0;

  return (
    <Layout showTestControls>
      <div className="flex flex-col h-full">
        {/* Tab bar */}
        <div className="flex border-b border-[#d1d9e0] bg-[#f6f8fa] px-4 gap-4 shrink-0">
          <button
            className={`py-2 text-sm font-medium border-b-2 -mb-px ${tab === "tests" ? "border-[#fd8c73] text-[#1f2328]" : "border-transparent text-[#59636e] hover:text-[#1f2328]"}`}
            onClick={() => setTab("tests")}
          >
            Tests
          </button>
          <button
            className={`py-2 text-sm font-medium border-b-2 -mb-px ${tab === "history" ? "border-[#fd8c73] text-[#1f2328]" : "border-transparent text-[#59636e] hover:text-[#1f2328]"}`}
            onClick={() => setTab("history")}
          >
            Run History
          </button>
        </div>

        {tab === "history" ? (
          <div className="flex-1 overflow-hidden">
            <RunHistory />
          </div>
        ) : hasTests ? (
          <>
            <div className="flex flex-1 overflow-hidden min-h-0">
              {/* LHS — 30% */}
              <aside className="border-r border-[#d1d9e0] bg-white flex flex-col overflow-hidden" style={{ flex: "0 0 30%" }}>
                <TestExplorer />
              </aside>

              {/* Center — 40% */}
              <div className="border-r border-[#d1d9e0] flex flex-col overflow-hidden min-w-0" style={{ flex: "0 0 40%" }}>
                <ResultsPanel />
              </div>

              {/* RHS — 30% */}
              <div className="flex-1 overflow-hidden min-w-0">
                <DetailPane testId={selectedTestId} onClose={() => selectTest(null)} />
              </div>
            </div>
            <SummaryDrawer />
          </>
        ) : (
          <div className="flex-1 overflow-hidden">
            <TestExplorer />
          </div>
        )}
      </div>
    </Layout>
  );
}
