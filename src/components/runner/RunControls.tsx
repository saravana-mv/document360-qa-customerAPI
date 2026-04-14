import { useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { useAuthStore, isSessionValid } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { getAllTests, getTestsByTag } from "../../lib/tests/registry";
import { runTests } from "../../lib/tests/runner";
import { buildTestContext } from "../../lib/tests/context";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "../common/Spinner";

export function RunControls() {
  const runner = useRunnerStore();
  const { token, logout } = useAuthStore();
  const setup = useSetupStore();
  const spec = useSpecStore();

  /**
   * If the session is no longer valid, clear auth + loaded tests so the
   * Test Manager drops back to the ProjectSettingsCard (sign-in prompt).
   * Returns true when the caller should abort the run.
   */
  function guardSession(): boolean {
    if (isSessionValid()) return false;
    logout();
    spec.setSpec(null, [], null);
    return true;
  }

  const allTests = getAllTests();
  const doneCount = Object.values(runner.testResults).filter(
    (t) => t.status !== "idle" && t.status !== "running"
  ).length;

  async function runAll() {
    if (guardSession() || !token) return;
    runner.resetRun();

    const ctx = buildTestContext(
      token,
      setup.selectedProjectId,
      setup.selectedVersionId,
      setup.langCode,
      setup.apiVersion,
      setup.articleId,
    );

    runner.initTests(allTests.map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      path: t.path,
      method: t.method,
    })));

    await runTests({ tests: allTests, context: ctx });
  }

  async function runSelected() {
    if (guardSession() || !token) return;
    runner.resetRun();

    const ctx = buildTestContext(
      token,
      setup.selectedProjectId,
      setup.selectedVersionId,
      setup.langCode,
      setup.apiVersion,
      setup.articleId,
    );

    let selectedTests = allTests;
    if (runner.selectedTags.size > 0 || runner.selectedTests.size > 0) {
      const fromTags = Array.from(runner.selectedTags).flatMap((tag) => getTestsByTag(tag));
      const fromTests = allTests.filter((t) => runner.selectedTests.has(t.id));
      const ids = new Set([...fromTags, ...fromTests].map((t) => t.id));
      selectedTests = allTests.filter((t) => ids.has(t.id));
    }

    runner.initTests(selectedTests.map((t) => ({
      id: t.id, name: t.name, tag: t.tag, path: t.path, method: t.method,
    })));

    await runTests({ tests: selectedTests, context: ctx });
  }

  // Listen for "run-selected" event dispatched by TopBar button
  useEffect(() => {
    const handler = () => { void runSelected(); };
    window.addEventListener("run-selected", handler);
    return () => window.removeEventListener("run-selected", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, runner.selectedTags, runner.selectedTests]);

  return (
    <div className="shrink-0">
      {/* Title row — aligns with LHS h-10 title header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa]">
        <span className="text-sm font-semibold text-[#1f2328]">Run Console</span>
        <span className="ml-auto text-xs text-[#656d76]">{allTests.length} tests</span>
      </div>
      {/* Controls row — aligns with LHS h-9 toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa]">
        <button
          onClick={runAll}
          disabled={runner.running}
          className="px-2.5 py-1 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-[#1a7f37]/80"
        >
          {runner.running && <Spinner size="sm" className="text-white" />}
          Run all
        </button>
        <button
          onClick={runSelected}
          disabled={runner.running}
          className="px-2.5 py-1 bg-white hover:bg-[#f6f8fa] text-[#1f2328] text-xs font-medium rounded-md transition-colors disabled:opacity-50 border border-[#d1d9e0]"
        >
          Run selected
        </button>
        {runner.running ? (
          <button
            onClick={runner.cancelRun}
            className="px-2.5 py-1 bg-white hover:bg-[#ffebe9] text-[#d1242f] text-xs font-medium rounded-md transition-colors border border-[#d1d9e0]"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={runner.fullReset}
            disabled={runner.running}
            className="px-2.5 py-1 bg-white hover:bg-[#f6f8fa] text-[#656d76] text-xs font-medium rounded-md transition-colors disabled:opacity-50 border border-[#d1d9e0]"
            title="Clear all results and selections"
          >
            Reset
          </button>
        )}
      </div>
      {runner.running && (
        <div className="px-4 py-2 border-b border-[#d1d9e0] bg-white">
          <ProgressBar total={Object.keys(runner.testResults).length} done={doneCount} />
        </div>
      )}
    </div>
  );
}
