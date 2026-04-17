import { useEffect } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { useAuthStore, isSessionValid } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { getAllTests, getTestsByTag } from "../../lib/tests/registry";
import { runTests } from "../../lib/tests/runner";
import { buildTestContext } from "../../lib/tests/context";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "../common/Spinner";
import type { TestContext } from "../../types/test.types";
import type { TestDef } from "../../types/test.types";

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

  const settingsMissing = !setup.selectedVersionId || !setup.langCode;

  /** Build per-tag context overrides from version configs */
  function buildContextByTag(tests: TestDef[]): Record<string, TestContext> {
    if (!token) return {};
    const scenarioOrg = useScenarioOrgStore.getState();
    const byTag: Record<string, TestContext> = {};
    const seen = new Set<string>();

    for (const t of tests) {
      if (seen.has(t.tag)) continue;
      seen.add(t.tag);
      const flowPath = t.flowFileName;
      if (!flowPath) continue;
      const version = scenarioOrg.getVersionForFlow(flowPath);
      if (!version) continue;
      const vc = scenarioOrg.versionConfigs[version];
      if (!vc?.baseUrl && !vc?.apiVersion && !vc?.authMethod) continue;
      byTag[t.tag] = buildTestContext(
        token,
        setup.selectedProjectId,
        setup.selectedVersionId,
        setup.langCode,
        vc.apiVersion || setup.apiVersion,
        vc.baseUrl || undefined,
        vc.authMethod || "oauth",
        version,
      );
    }
    return byTag;
  }

  async function runAll() {
    if (guardSession() || !token) return;
    runner.resetRun();

    const ctx = buildTestContext(
      token,
      setup.selectedProjectId,
      setup.selectedVersionId,
      setup.langCode,
      setup.apiVersion,
    );

    runner.initTests(allTests.map((t) => ({
      id: t.id,
      name: t.name,
      tag: t.tag,
      path: t.path,
      method: t.method,
    })));

    const contextByTag = buildContextByTag(allTests);
    await runTests({ tests: allTests, context: ctx, contextByTag });
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
    );

    if (runner.selectedTags.size === 0 && runner.selectedTests.size === 0) return;
    const fromTags = Array.from(runner.selectedTags).flatMap((tag) => getTestsByTag(tag));
    const fromTests = allTests.filter((t) => runner.selectedTests.has(t.id));
    const ids = new Set([...fromTags, ...fromTests].map((t) => t.id));
    const selectedTests = allTests.filter((t) => ids.has(t.id));
    if (selectedTests.length === 0) return;

    runner.initTests(selectedTests.map((t) => ({
      id: t.id, name: t.name, tag: t.tag, path: t.path, method: t.method,
    })));

    const contextByTag = buildContextByTag(selectedTests);
    await runTests({ tests: selectedTests, context: ctx, contextByTag });
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
        <span className="ml-auto text-xs text-[#656d76]">{allTests.length} scenario{allTests.length !== 1 ? "s" : ""}</span>
      </div>
      {/* Settings warning */}
      {settingsMissing && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#fff8c5]">
          <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <span className="text-xs text-[#9a6700]">
            {!setup.selectedVersionId && !setup.langCode
              ? "Version and language not set — open Project Settings and save before running."
              : !setup.selectedVersionId
                ? "Version not set — open Project Settings and save before running."
                : "Language not set — open Project Settings and save before running."}
          </span>
        </div>
      )}
      {/* Controls row — aligns with LHS h-9 toolbar */}
      <div className="flex items-center gap-2 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa]">
        <button
          onClick={runAll}
          disabled={runner.running || settingsMissing}
          className="px-2.5 py-1 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-[#1a7f37]/80"
        >
          {runner.running && <Spinner size="sm" className="text-white" />}
          Run all
        </button>
        <button
          onClick={runSelected}
          disabled={runner.running || settingsMissing || (runner.selectedTags.size === 0 && runner.selectedTests.size === 0)}
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
      {runner.paused && runner.pausedAt && (
        <div className="px-4 py-2 border-b border-[#d1d9e0] bg-[#fff8c5] flex items-center gap-3">
          <span className="text-[#9a6700] shrink-0" title="Paused at breakpoint">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <rect x="4" y="3" width="3" height="10" rx="0.5" />
              <rect x="9" y="3" width="3" height="10" rx="0.5" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#1f2328]">Paused at breakpoint</div>
            <div className="text-xs text-[#656d76] truncate">
              {runner.pausedAt.tag} → {runner.pausedAt.testName}
            </div>
          </div>
          <button
            onClick={runner.resume}
            className="px-2.5 py-1 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors border border-[#1a7f37]/80 shrink-0"
          >
            Resume
          </button>
        </div>
      )}
      {runner.running && (
        <div className="px-4 py-2 border-b border-[#d1d9e0] bg-white">
          <ProgressBar total={Object.keys(runner.testResults).length} done={doneCount} />
        </div>
      )}
    </div>
  );
}
