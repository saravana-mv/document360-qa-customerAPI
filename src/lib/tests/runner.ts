import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../types/test.types";
import { runAssertions } from "./assertions";
import { useRunnerStore } from "../../store/runner.store";
import { isBreakpointSet } from "../../store/breakpoints.store";
import { saveTestRun } from "../api/testRunsApi";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { fetchFolderApiRules, fetchApiRules } from "../api/apiRulesApi";
import { getSpecFileContent } from "../api/specFilesApi";
import { setEnumAliases, parseEnumAliasesFromMarkdown } from "./flowXml/enumAliases";
import { findMissingProjVars, suggestSimilarVar } from "./validateProjVars";
import { useProjectVariablesStore } from "../../store/projectVariables.store";

export interface RunOptions {
  tests: TestDef[];
  context: TestContext;
  contextByTag?: Record<string, TestContext>;
  onComplete?: () => void;
}

function getStore() {
  return useRunnerStore.getState();
}

function log(message: string, level: "info" | "success" | "error" | "warn" = "info", tag?: string, testId?: string, testName?: string) {
  getStore().appendLog({ message, level, tag, testId, testName });
}

async function executeTest(
  test: TestDef,
  ctx: TestContext,
  state: RunState
): Promise<void> {
  const store = getStore();
  if (store.cancelled) {
    store.updateTestStatus(test.id, { status: "skip" });
    log("Skipped", "warn", test.tag, test.id, test.name);
    return;
  }

  store.updateTestStatus(test.id, { status: "running", startedAt: Date.now() });

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
        log(`Teardown failed: ${err}`, "warn", test.tag, test.id, test.name);
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
    responseHeaders: result.responseHeaders,
    requestUrl: result.requestUrl,
    requestHeaders: result.requestHeaders,
    requestBody: result.requestBody,
    stateSnapshot: result.stateSnapshot,
    completedAt,
  });

  if (result.status === "pass") {
    log(`✓ Passed (${result.durationMs}ms)`, "success", test.tag, test.id, test.name);
  } else {
    log(`✗ ${result.failureReason || result.status}`, "error", test.tag, test.id, test.name);
  }
}

async function runTag(tag: string, tests: TestDef[], ctx: TestContext): Promise<void> {
  const store = getStore();
  const state: RunState = {};
  const startedAt = Date.now();

  store.updateTagStatus(tag, "running");
  log("STARTED", "info", tag);

  // Pre-flight: identify steps that reference undefined project variables
  const definedVarNames = new Set(Object.keys(useProjectVariablesStore.getState().asRecord()));
  const stepsWithMissingVars = new Map<string, string[]>(); // testId → missing var names
  for (const test of tests) {
    const missing = findMissingProjVars([test], definedVarNames);
    if (missing.length > 0) {
      stepsWithMissingVars.set(test.id, missing.map((mv) => mv.varName));
    }
  }

  let aborted = false;
  for (let i = 0; i < tests.length; i++) {
    const test = tests[i];
    if (aborted && !test.isTeardown) {
      getStore().updateTestStatus(test.id, { status: "skip" });
      log("Skipped (flow stopped)", "warn", tag, test.id, test.name);
      continue;
    }
    if (aborted && test.isTeardown) {
      log("Running teardown despite earlier failure", "warn", tag, test.id, test.name);
    }
    // Honour user-set breakpoints: pause BEFORE the step runs so the user can
    // poke at external state (e.g. the Document360 admin UI), then click Resume.
    // Allowed on teardown steps too — useful for inspecting created entities
    // before they are cleaned up.
    if (isBreakpointSet(test.id) && !getStore().cancelled) {
      log("⏸ Paused at breakpoint — click Resume to continue", "warn", tag, test.id, test.name);
      await getStore().enterPause({ testId: test.id, testName: test.name, tag });
      if (getStore().cancelled) {
        getStore().updateTestStatus(test.id, { status: "skip" });
        log("Skipped (cancelled)", "warn", tag, test.id, test.name);
        continue;
      }
    }
    // Block steps with undefined project variables — mark as error without sending request
    const missingForStep = stepsWithMissingVars.get(test.id);
    if (missingForStep) {
      const parts = missingForStep.map((v) => {
        const suggestion = suggestSimilarVar(v, definedVarNames);
        return suggestion ? `proj.${v} (did you mean proj.${suggestion}?)` : `proj.${v}`;
      });
      const varList = parts.join(", ");
      const reason = `Undefined project variable${missingForStep.length > 1 ? "s" : ""}: ${varList} — add in Settings → Variables`;
      getStore().updateTestStatus(test.id, {
        status: "error",
        durationMs: 0,
        failureReason: reason,
        completedAt: Date.now(),
      });
      log(`✗ ${reason}`, "error", tag, test.id, test.name);
      if (!aborted) aborted = true;
      continue;
    }
    await executeTest(test, ctx, state);
    const result = getStore().testResults[test.id];
    const failed = result?.status === "fail" || result?.status === "error";
    if (getStore().cancelled) {
      // User cancellation: skip everything that's left, including teardowns.
      for (let j = i + 1; j < tests.length; j++) {
        getStore().updateTestStatus(tests[j].id, { status: "skip" });
        log("Skipped (cancelled)", "warn", tag, tests[j].id, tests[j].name);
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
  const passed = tagTests.filter((t) => t.status === "pass").length;
  log(`COMPLETED (${passed}/${tagTests.length} passed in ${durationMs}ms)`, rollup === "pass" ? "success" : "warn", tag);
}

export async function runTests(options: RunOptions): Promise<void> {
  const { tests, context } = options;
  const store = getStore();

  // Load enum aliases — try _system/_skills.md → Skills.md (legacy) → _rules.json → project-level Cosmos
  try {
    const firstPath = tests[0]?.flowFileName ?? "";
    const versionFolder = firstPath.split("/")[0];
    let loaded = false;
    if (versionFolder) {
      // Try _system/_skills.md first (new path)
      try {
        const md = await getSpecFileContent(`${versionFolder}/_system/_skills.md`);
        if (md?.trim()) {
          const aliases = parseEnumAliasesFromMarkdown(md);
          if (aliases) { setEnumAliases(aliases); loaded = true; }
        }
      } catch { /* _skills.md not found */ }
      // Try legacy Skills.md fallback
      if (!loaded) {
        try {
          const md = await getSpecFileContent(`${versionFolder}/Skills.md`);
          if (md?.trim()) {
            const aliases = parseEnumAliasesFromMarkdown(md);
            if (aliases) { setEnumAliases(aliases); loaded = true; }
          }
        } catch { /* Skills.md not found */ }
      }
      // Try _rules.json fallback
      if (!loaded) {
        const { enumAliases } = await fetchFolderApiRules(versionFolder);
        if (enumAliases) { setEnumAliases(enumAliases); loaded = true; }
      }
    }
    if (!loaded) {
      const { enumAliases } = await fetchApiRules();
      setEnumAliases(enumAliases);
    }
  } catch { /* proceed without aliases */ }

  store.startRun();
  const startedAt = Date.now();

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
    const tagCtx = options.contextByTag?.[tag] ?? context;
    await runTag(tag, testsByTag.get(tag)!, tagCtx);
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

  // Persist run to Cosmos DB (fire-and-forget — don't block UI)
  const finalState = getStore();

  // Collect scenarioId mappings for server-side diagnosis lookups
  const flowStatus = useFlowStatusStore.getState().byName;
  const scenarioIds: Record<string, string> = {};
  for (const [fileName, entry] of Object.entries(flowStatus)) {
    if (entry.scenarioId) scenarioIds[fileName] = entry.scenarioId;
  }

  saveTestRun({
    id: `run:${crypto.randomUUID()}`,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completedAt).toISOString(),
    summary,
    tagResults: { ...finalState.tagResults },
    testResults: { ...finalState.testResults },
    log: finalState.log.slice(0, 500),
    scenarioIds,
  }).catch((e) => console.warn("[runner] Failed to save test run:", e));

  options.onComplete?.();
}
