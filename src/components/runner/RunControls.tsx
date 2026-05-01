import { useState, useEffect, useMemo } from "react";
import { useRunnerStore } from "../../store/runner.store";
import { useSetupStore } from "../../store/setup.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { getAllTests, getTestsByTag } from "../../lib/tests/registry";
import { runTests } from "../../lib/tests/runner";
import { buildTestContext } from "../../lib/tests/context";
import { ProgressBar } from "./ProgressBar";
import { Spinner } from "../common/Spinner";
import { ConnectEndpointModal } from "../explorer/ConnectEndpointModal";
import { healthCheckOAuth } from "../../lib/api/oauthApi";
import type { HealthCheckResult } from "../../lib/api/oauthApi";
import { useConnectionsStore } from "../../store/connections.store";
import type { TestContext } from "../../types/test.types";
import type { TestDef } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { useSpecStore } from "../../store/spec.store";
import { useProjectVariablesStore } from "../../store/projectVariables.store";
import { findEmptyProjVars, findMissingProjVars } from "../../lib/tests/validateProjVars";
import { Link } from "react-router-dom";

// Entra gates access; the proxy handles real credentials server-side.
const PROXY_TOKEN: TokenSet = { access_token: "proxied", token_type: "Bearer" };

export function RunControls() {
  const runner = useRunnerStore();
  const setup = useSetupStore();

  const allTests = getAllTests();
  const doneCount = Object.values(runner.testResults).filter(
    (t) => t.status !== "idle" && t.status !== "running"
  ).length;

  // Check for unconnected versions
  const versionConfigs = useScenarioOrgStore((s) => s.versionConfigs);
  const unconnectedVersions = useMemo(() => {
    const versions = new Set<string>();
    for (const t of allTests) {
      if (!t.flowFileName) continue;
      const idx = t.flowFileName.indexOf("/");
      if (idx > 0) versions.add(t.flowFileName.slice(0, idx));
    }
    return Array.from(versions).filter((v) => {
      const vc = versionConfigs[v];
      if (!vc) return true;
      if (vc.authType === "none") return false;
      if (vc.authType === "oauth") return !vc.connectionId;
      return !vc.credentialConfigured;
    });
  }, [allTests, versionConfigs]);

  // ── Pre-run connection health check ──────────────────────────────────
  // Runs a real health check for OAuth connections and verifies non-OAuth
  // connections have stored credentials. Shows a clear banner if any fail.
  interface ConnectionIssue {
    version: string;
    connectionName: string;
    reason: string;
  }
  const [connectionIssues, setConnectionIssues] = useState<ConnectionIssue[]>([]);
  const [healthCheckDone, setHealthCheckDone] = useState(false);
  const connections = useConnectionsStore((s) => s.connections);

  // Stabilise the version list so the health-check effect doesn't re-fire
  // on every render (getAllTests() returns a new array reference each time).
  const testVersionsKey = useMemo(() => {
    const vs = new Set<string>();
    for (const t of allTests) {
      if (!t.flowFileName) continue;
      const idx = t.flowFileName.indexOf("/");
      if (idx > 0) vs.add(t.flowFileName.slice(0, idx));
    }
    return Array.from(vs).sort().join(",");
  }, [allTests]);

  useEffect(() => {
    if (!testVersionsKey) { setConnectionIssues([]); setHealthCheckDone(true); return; }

    // Collect unique versions from the stable key
    const versionSet = new Set(testVersionsKey.split(","));

    let cancelled = false;

    async function check() {
      const issues: ConnectionIssue[] = [];

      for (const version of versionSet) {
        const vc = versionConfigs[version];

        // No version config at all — needs endpoint setup
        if (!vc) {
          issues.push({ version, connectionName: "(none)", reason: "Endpoint not configured" });
          continue;
        }

        const isOAuth = vc.authType === "oauth";
        const hasCredential = vc.credentialConfigured || (isOAuth && !!vc.connectionId);

        // Same logic as VersionAccordion's isConnected check
        if (!hasCredential) {
          issues.push({ version, connectionName: "(none)", reason: "No connection configured" });
          continue;
        }

        // For OAuth connections, run a real health check
        if (isOAuth && vc.connectionId) {
          const conn = connections.find(c => c.id === vc.connectionId);
          const connName = conn?.name || vc.connectionId;
          try {
            const result: HealthCheckResult = await healthCheckOAuth(vc.connectionId);
            if (!result.healthy) {
              issues.push({ version, connectionName: connName, reason: result.reason || "OAuth token invalid or expired" });
            }
          } catch {
            issues.push({ version, connectionName: connName, reason: "OAuth sign-in required" });
          }
        }
      }

      if (!cancelled) {
        setConnectionIssues(issues);
        setHealthCheckDone(true);
      }
    }

    setHealthCheckDone(false);
    void check();
    return () => { cancelled = true; };
  }, [testVersionsKey, versionConfigs, connections]);

  const hasConnectionIssues = connectionIssues.length > 0;

  // Check for missing or empty project variables referenced by test flows
  const projVars = useProjectVariablesStore((s) => s.variables);
  const varProblems = useMemo(() => {
    if (allTests.length === 0) return [];
    const definedNames = new Set(projVars.map(v => v.name));
    const missing = findMissingProjVars(allTests, definedNames);
    const empty = findEmptyProjVars(allTests, projVars);
    return [
      ...missing.map(m => ({ varName: m.varName, reason: "undefined" as const, usedBy: m.usedBy })),
      ...empty.map(e => ({ varName: e.varName, reason: "empty" as const, usedBy: e.usedBy })),
    ];
  }, [allTests, projVars]);
  const hasVarProblems = varProblems.length > 0;

  const [connectVersion, setConnectVersion] = useState<string | null>(null);

  /** Build per-tag context overrides from version configs + scenario overrides.
   *  Priority: scenario override > version config > global defaults */
  function buildContextByTag(tests: TestDef[]): Record<string, TestContext> {
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
      if (!vc?.connectionId && !vc?.baseUrl && !vc?.apiVersion && !vc?.authType) continue;

      // Look up connection doc for baseUrl/apiVersion (connection is source of truth)
      const conn = vc?.connectionId ? connections.find(c => c.id === vc.connectionId) : undefined;

      // Merge scenario-level overrides on top of version config
      const sc = scenarioOrg.scenarioConfigs[flowPath];
      byTag[t.tag] = buildTestContext({
        token: PROXY_TOKEN,
        apiVersion: sc?.apiVersion || conn?.apiVersion || vc.apiVersion || setup.apiVersion,
        baseUrl: sc?.baseUrl || conn?.baseUrl || vc.baseUrl || undefined,
        authType: sc?.authType || vc.authType || "none",
        authVersion: version,
        authHeaderName: sc?.authHeaderName || vc.authHeaderName,
        authQueryParam: sc?.authQueryParam || vc.authQueryParam,
        connectionId: vc?.connectionId,
      });
    }
    return byTag;
  }

  async function runAll() {
    if (unconnectedVersions.length > 0) {
      setConnectVersion(unconnectedVersions[0]);
      return;
    }
    runner.resetRun();

    const ctx = buildTestContext({
      token: PROXY_TOKEN,
      apiVersion: setup.apiVersion,
    });

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
    if (unconnectedVersions.length > 0) {
      setConnectVersion(unconnectedVersions[0]);
      return;
    }

    if (runner.selectedTags.size === 0 && runner.selectedTests.size === 0) return;
    const fromTags = Array.from(runner.selectedTags).flatMap((tag) => getTestsByTag(tag));
    const fromTests = allTests.filter((t) => runner.selectedTests.has(t.id));
    const ids = new Set([...fromTags, ...fromTests].map((t) => t.id));
    const selectedTests = allTests.filter((t) => ids.has(t.id));
    if (selectedTests.length === 0) return;

    runner.resetRun();

    const ctx = buildTestContext({
      token: PROXY_TOKEN,
      apiVersion: setup.apiVersion,
    });

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
  }, [runner.selectedTags, runner.selectedTests]);

  const viewingHistory = runner.viewingHistory;
  const parsedTags = useSpecStore((s) => s.parsedTags);

  // Detect scenarios from the history run that no longer exist
  const deletedTags = useMemo(() => {
    if (!viewingHistory) return [];
    const currentTagNames = new Set(parsedTags.map((t) => t.name));
    return Object.keys(runner.tagResults).filter((tag) => !currentTagNames.has(tag));
  }, [viewingHistory, runner.tagResults, parsedTags]);

  return (
    <div className="shrink-0">
      {/* Title row — aligns with LHS h-10 title header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa]">
        <span className="text-sm font-semibold text-[#1f2328]">Run Console</span>
        <span className="ml-auto text-xs text-[#656d76]">{allTests.length} scenario{allTests.length !== 1 ? "s" : ""}</span>
      </div>

      {/* History view banner */}
      {viewingHistory && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-[#d1d9e0] bg-[#ddf4ff]">
          <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
          </svg>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-[#0969da]">
              Viewing past run
              {viewingHistory.source === "api" && (
                <span className="ml-1.5 inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#fbefff] text-[#8250df]">API</span>
              )}
            </div>
            <div className="text-[11px] text-[#656d76] truncate">
              {new Date(viewingHistory.startedAt).toLocaleString()} by {viewingHistory.triggeredBy}
              {viewingHistory.scenarioName && ` — ${viewingHistory.scenarioName}`}
            </div>
            <div className="inline-flex items-center gap-1 mt-0.5">
              <code className="text-[10px] font-mono text-[#8b949e]">{viewingHistory.runId}</code>
              <button
                onClick={() => navigator.clipboard.writeText(viewingHistory.runId)}
                className="p-0.5 rounded text-[#8b949e] hover:text-[#0969da] hover:bg-[#ddf4ff]/50 transition-colors"
                title="Copy run ID"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                </svg>
              </button>
            </div>
          </div>
          <button
            onClick={runner.clearHistoryView}
            className="px-2.5 py-1 bg-white hover:bg-[#f6f8fa] text-[#1f2328] text-xs font-medium rounded-md transition-colors border border-[#d1d9e0] shrink-0"
          >
            Back to live
          </button>
        </div>
      )}

      {/* Deleted scenarios warning */}
      {viewingHistory && deletedTags.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#fff8c5]">
          <svg className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs font-medium text-[#9a6700]">
              {deletedTags.length} scenario{deletedTags.length !== 1 ? "s" : ""} from this run {deletedTags.length !== 1 ? "have" : "has"} been deleted
            </p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {deletedTags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#ffebe9] text-[#d1242f] border border-[#ffcecb]">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                  <span className="line-through">{tag}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Controls row — aligns with LHS h-9 toolbar */}
      {!viewingHistory && (
      <div className="flex items-center gap-2 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa]">
        <button
          onClick={runAll}
          disabled={runner.running || !healthCheckDone || hasConnectionIssues || hasVarProblems || unconnectedVersions.length > 0}
          title={hasVarProblems ? "Project variables missing values — configure in Settings → Variables" : unconnectedVersions.length > 0 ? "Endpoint not connected — connect before running" : hasConnectionIssues ? "Connection credential issue — check Settings → Connections" : !healthCheckDone ? "Checking connection credentials…" : undefined}
          className="px-2.5 py-1 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-[#1f883d]/80"
        >
          {runner.running && <Spinner size="sm" className="text-white" />}
          Run all
        </button>
        <button
          onClick={runSelected}
          disabled={runner.running || !healthCheckDone || hasConnectionIssues || hasVarProblems || unconnectedVersions.length > 0 || (runner.selectedTags.size === 0 && runner.selectedTests.size === 0)}
          title={hasVarProblems ? "Project variables missing values — configure in Settings → Variables" : unconnectedVersions.length > 0 ? "Endpoint not connected — connect before running" : hasConnectionIssues ? "Connection credential issue — check Settings → Connections" : !healthCheckDone ? "Checking connection credentials…" : undefined}
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
      )}
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
              {runner.pausedAt.tag} &rarr; {runner.pausedAt.testName}
            </div>
          </div>
          <button
            onClick={runner.resume}
            className="px-2.5 py-1 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-xs font-medium rounded-md transition-colors border border-[#1f883d]/80 shrink-0"
          >
            Resume
          </button>
        </div>
      )}
      {/* Unconnected versions warning */}
      {!viewingHistory && !runner.running && unconnectedVersions.length > 0 && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#fff8c5]">
          <svg className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
          </svg>
          <div className="min-w-0">
            <p className="text-xs text-[#9a6700]">
              {unconnectedVersions.length === 1
                ? `Version ${unconnectedVersions[0]} is not connected to an endpoint.`
                : `${unconnectedVersions.length} versions not connected: ${unconnectedVersions.join(", ")}`}
            </p>
            <button
              onClick={() => setConnectVersion(unconnectedVersions[0])}
              className="text-xs text-[#0969da] hover:underline mt-0.5"
            >
              Connect now
            </button>
          </div>
        </div>
      )}
      {/* Connection credential issues */}
      {!viewingHistory && !runner.running && healthCheckDone && hasConnectionIssues && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#ffebe9]">
          <svg className="w-4 h-4 text-[#d1242f] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#d1242f]">
              Connection {connectionIssues.length === 1 ? "issue" : "issues"} — cannot run scenarios
            </p>
            <div className="mt-1 space-y-0.5">
              {connectionIssues.map(issue => (
                <p key={issue.version} className="text-xs text-[#656d76]">
                  <span className="font-medium text-[#1f2328]">{issue.version}</span>
                  {" → "}
                  <span className="text-[#d1242f]">{issue.reason}</span>
                  {issue.connectionName !== "(none)" && (
                    <span className="text-[#656d76]"> ({issue.connectionName})</span>
                  )}
                </p>
              ))}
            </div>
            <Link
              to="/settings/connections"
              className="text-xs text-[#0969da] hover:underline mt-1 inline-block"
            >
              Configure in Settings → Connections
            </Link>
          </div>
        </div>
      )}
      {/* Health check in progress */}
      {!viewingHistory && !runner.running && !healthCheckDone && allTests.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#d1d9e0] bg-[#f6f8fa]">
          <Spinner size="sm" className="text-[#656d76]" />
          <span className="text-xs text-[#656d76]">Checking connection credentials…</span>
        </div>
      )}
      {/* Missing / empty project variables warning */}
      {!viewingHistory && !runner.running && hasVarProblems && (
        <div className="flex items-start gap-2 px-4 py-2 border-b border-[#d1d9e0] bg-[#ffebe9]">
          <svg className="w-4 h-4 text-[#d1242f] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-[#d1242f]">
              {varProblems.length} project variable{varProblems.length !== 1 ? "s" : ""} missing value{varProblems.length !== 1 ? "s" : ""}
            </p>
            <div className="flex flex-wrap gap-1 mt-1">
              {varProblems.map(v => (
                <span key={v.varName} className="text-xs text-[#d1242f] font-mono bg-[#ffcecb]/40 px-1 rounded">
                  {v.reason === "undefined" ? `proj.${v.varName} (not defined)` : `proj.${v.varName}`}
                </span>
              ))}
            </div>
            <Link
              to="/settings/variables"
              className="text-xs text-[#0969da] hover:underline mt-1 inline-block"
            >
              Configure in Settings → Variables
            </Link>
          </div>
        </div>
      )}
      {runner.running && (
        <div className="px-4 py-2 border-b border-[#d1d9e0] bg-white">
          <ProgressBar total={Object.keys(runner.testResults).length} done={doneCount} />
        </div>
      )}
      {/* Connect Endpoint Modal (triggered by run gating) */}
      {connectVersion && (
        <ConnectEndpointModal version={connectVersion} onClose={() => setConnectVersion(null)} />
      )}
    </div>
  );
}
