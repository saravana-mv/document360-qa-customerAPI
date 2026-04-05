import { useState } from "react";
import { Layout } from "../components/common/Layout";
import { TestExplorer } from "../components/explorer/TestExplorer";
import { ResultsPanel } from "../components/results/ResultsPanel";
import { SummaryDrawer } from "../components/results/SummaryDrawer";
import { DiffModal } from "../components/results/DiffModal";
import { useAuthGuard } from "../hooks/useAuthGuard";

export function TestPage() {
  useAuthGuard();
  const [diffOpen, setDiffOpen] = useState(false);

  function handleRunSelected() {
    // RunControls handles the logic; this triggers from TopBar
    // We emit a custom event that RunControls can listen to
    window.dispatchEvent(new CustomEvent("run-selected"));
  }

  return (
    <Layout
      showTestControls
      onCheckChanges={() => setDiffOpen(true)}
      onRunSelected={handleRunSelected}
    >
      <div className="flex h-full">
        {/* Sidebar */}
        <aside className="w-72 border-r border-gray-200 bg-white flex flex-col h-full overflow-hidden">
          <TestExplorer />
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <ResultsPanel />
          <SummaryDrawer />
        </div>
      </div>

      <DiffModal open={diffOpen} onClose={() => setDiffOpen(false)} />
    </Layout>
  );
}
