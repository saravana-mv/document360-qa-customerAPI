import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../types/test.types";
import { runAssertions } from "./assertions";
import { useRunnerStore } from "../../store/runner.store";

export interface RunOptions {
  tests: TestDef[];
  context: TestContext;
  onComplete?: () => void;
}

function getStore() {
  return useRunnerStore.getState();
}

function log(message: string, level: "info" | "success" | "error" | "warn" = "info", tag?: string, testId?: string) {
  getStore().appendLog({ message, level, tag, testId });
}

async function executeTest(
  test: TestDef,
  ctx: TestContext,
  state: RunState
): Promise<void> {
  const store = getStore();
  if (store.cancelled) {
    store.updateTestStatus(test.id, { status: "skip" });
    log(`Skipped: ${test.name}`, "warn", test.tag, test.id);
    return;
  }

  store.updateTestStatus(test.id, { status: "running", startedAt: Date.now() });
  log(`Running: ${test.name}`, "info", test.tag, test.id);

  let result: TestExecutionResult;
  const startMs = Date.now();

  try {
    if (test.setup) {
      await test.setup(ctx, state);
    }

    result = await test.execute(ctx, state);
    result.assertionResults = runAssertions(test.assertions, result, state);

    const allPassed = result.assertionResults.every((a) => a.passed);
    if (result.status === "pass" && !allPassed) {
      result.status = "fail";
      result.failureReason = result.assertionResults
        .filter((a) => !a.passed)
        .map((a) => a.description)
        .join("; ");
    }
  } catch (err: unknown) {
    result = {
      status: "error",
      durationMs: Date.now() - startMs,
      failureReason: err instanceof Error ? err.message : String(err),
      assertionResults: [],
    };
  } finally {
    if (test.teardown) {
      try {
        await test.teardown(ctx, state);
      } catch (err) {
        log(`Teardown failed for ${test.name}: ${err}`, "warn", test.tag, test.id);
      }
    }
  }

  const completedAt = Date.now();
  store.updateTestStatus(test.id, {
    status: result.status,
    durationMs: result.durationMs,
    httpStatus: result.httpStatus,
    failureReason: result.failureReason,
    assertionResults: result.assertionResults,
    responseBody: result.responseBody,
    requestUrl: result.requestUrl,
    requestBody: result.requestBody,
    stateSnapshot: result.stateSnapshot,
    completedAt,
  });

  if (result.status === "pass") {
    log(`✓ ${test.name} (${result.durationMs}ms)`, "success", test.tag, test.id);
  } else {
    log(`✗ ${test.name}: ${result.failureReason || result.status}`, "error", test.tag, test.id);
  }
}

async function runTag(tag: string, tests: TestDef[], ctx: TestContext): Promise<void> {
  const store = getStore();
  const state: RunState = {};
  const startedAt = Date.now();

  store.updateTagStatus(tag, "running");
  log(`Starting flow: ${tag}`, "info", tag);

  let aborted = false;
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (aborted && !test.isTeardown) {
      getStore().updateTestStatus(test.id, { status: "skip" });
      log(`Skipped (flow stopped): ${test.name}`, "warn", tag, test.id);
      continue;
    }
    if (aborted && test.isTeardown) {
      log(`Running teardown despite earlier failure: ${test.name}`, "warn", tag, test.id);
    }
    await executeTest(test, ctx, state);
    const result = getStore().testResults[test.id];
    const failed = result?.status === "fail" || result?.status === "error";
    if (getStore().cancelled) {
      // User cancellation: skip everything that's left, including teardowns.
      for (let j = i + 1; j < tests.length; j++) {
        getStore().updateTestStatus(tests[j].id, { status: "skip" });
        log(`Skipped (cancelled): ${tests[j].name}`, "warn", tag, tests[j].id);
      }
      break;
    }
    if (failed && !aborted) {
      aborted = true;
      // Continue the loop — teardown steps still get a chance to run.
    }
  }

  const tagTests = Object.values(getStore().testResults).filter((t) => t.tag === tag);
  const anyFail = tagTests.some((t) => t.status === "fail" || t.status === "error");
  const allPass = tagTests.every((t) => t.status === "pass");
  const anySkip = tagTests.some((t) => t.status === "skip");

  let rollup: "pass" | "fail" | "partial" = "partial";
  if (allPass) rollup = "pass";
  else if (anyFail && !anySkip) rollup = "fail";

  const durationMs = Date.now() - startedAt;
  store.updateTagStatus(tag, rollup, durationMs);
  log(`Tag ${tag} complete: ${rollup} (${durationMs}ms)`, rollup === "pass" ? "success" : "warn", tag);
}

export async function runTests(options: RunOptions): Promise<void> {
  const { tests, context } = options;
  const store = getStore();

  store.startRun();
  const startedAt = Date.now();
  log("Test run started", "info");

  // Group tests by tag preserving order
  const tagOrder: string[] = [];
  const testsByTag = new Map<string, TestDef[]>();

  for (const test of tests) {
    if (!testsByTag.has(test.tag)) {
      testsByTag.set(test.tag, []);
      tagOrder.push(test.tag);
    }
    testsByTag.get(test.tag)!.push(test);
  }

  for (const tag of tagOrder) {
    if (getStore().cancelled) break;
    await runTag(tag, testsByTag.get(tag)!, context);
  }

  const completedAt = Date.now();
  const allResults = Object.values(getStore().testResults);
  const summary = {
    total: allResults.length,
    pass: allResults.filter((t) => t.status === "pass").length,
    fail: allResults.filter((t) => t.status === "fail" || t.status === "error").length,
    skip: allResults.filter((t) => t.status === "skip").length,
    error: allResults.filter((t) => t.status === "error").length,
    durationMs: completedAt - startedAt,
    startedAt,
    completedAt,
  };

  store.setSummary(summary);
  log(`Run complete — ${summary.pass}/${summary.total} passed in ${summary.durationMs}ms`,
    summary.fail === 0 ? "success" : "error");

  options.onComplete?.();
}
