import { useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { getAllTests, getTestsByTag } from "../../lib/tests/registry";
import { runTests } from "../../lib/tests/runner";
import { buildTestContext } from "../../lib/tests/context";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "../common/Spinner";

export function RunControls() {
  const runner = useRunnerStore();
  const { token } = useAuthStore();
  const setup = useSetupStore();

  const allTests = getAllTests();
  const doneCount = Object.values(runner.testResults).filter(
    (t) => t.status !== "idle" && t.status !== "running"
  ).length;

  async function runAll() {
    if (!token) return;
    runner.resetRun();

    const ctx = buildTestContext(
      token,
      setup.selectedProjectId,
      setup.selectedVersionId,
      setup.langCode,
      setup.articleId || undefined
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
    if (!token) return;
    runner.resetRun();

    const ctx = buildTestContext(
      token,
      setup.selectedProjectId,
      setup.selectedVersionId,
      setup.langCode,
      setup.articleId || undefined
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
    <div className="flex flex-col gap-3 p-4 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2">
        <button
          onClick={runAll}
          disabled={runner.running}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {runner.running && <Spinner size="sm" className="text-white" />}
          Run All
        </button>
        <button
          onClick={runSelected}
          disabled={runner.running}
          className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          Run Selected
        </button>
        {runner.running ? (
          <button
            onClick={runner.cancelRun}
            className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 text-sm font-medium rounded-lg transition-colors"
          >
            Stop
          </button>
        ) : (
          <button
            onClick={runner.fullReset}
            disabled={runner.running}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-500 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            title="Clear all results and selections"
          >
            Reset
          </button>
        )}
        <span className="ml-auto text-xs text-gray-500">{allTests.length} tests total</span>
      </div>
      {runner.running && (
        <ProgressBar total={Object.keys(runner.testResults).length} done={doneCount} />
      )}
    </div>
  );
}
