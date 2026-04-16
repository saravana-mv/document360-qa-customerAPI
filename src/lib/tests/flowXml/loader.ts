// Loads .flow.xml files from Cosmos DB that are marked as "active tests",
// parses each into a TestDef[] and registers them in the test runner's registry.
// Updates the flow-status store so the Flow Manager UI can reflect status.

import { listFlowFiles, getFlowFileContent } from "../../api/flowFilesApi";
import { useFlowStatusStore } from "../../../store/flowStatus.store";
import { registerSuite, unregisterWhere } from "../registry";
import { parseFlowXml, FlowXmlParseError } from "./parser";
import { buildFlow } from "./builder";
import { getActiveFlows } from "./activeTests";

let lastLoadPromise: Promise<void> | null = null;

/**
 * Public entry point. Lists every .flow.xml in the queue, parses each
 * ACTIVE flow, and registers the resulting TestDefs. Concurrent calls
 * share a single in-flight load so callers don't trigger duplicate work.
 */
export function loadFlowsFromQueue(): Promise<void> {
  if (lastLoadPromise) return lastLoadPromise;
  lastLoadPromise = doLoad().finally(() => { lastLoadPromise = null; });
  return lastLoadPromise;
}

async function doLoad(): Promise<void> {
  const status = useFlowStatusStore.getState();
  status.setLoading(true);

  let files: { name: string }[] = [];
  try {
    const all = await listFlowFiles();
    files = all.filter((f) => f.name.endsWith(".flow.xml"));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[loadFlowsFromQueue] listing failed:", err);
    status.setLoading(false);
    return;
  }

  // Only register flows that are in the active-tests set (now async)
  let activeSet: Set<string>;
  try {
    activeSet = await getActiveFlows();
  } catch (err) {
    console.error("[loadFlowsFromQueue] fetching active tests failed:", err);
    status.setLoading(false);
    return;
  }
  const activeFiles = files.filter((f) => activeSet.has(f.name));

  // Clean slate — drop every previously registered xml-sourced test and
  // prune status entries for files that no longer exist.
  unregisterWhere((def) => def.id.startsWith("xml:"));
  status.pruneTo(new Set(activeFiles.map((f) => f.name)));

  // Mark every active file as "loading" up-front so the UI can show progress.
  for (const f of activeFiles) {
    status.setEntry({ name: f.name, status: "loading" });
  }

  // Fetch + parse + register in parallel.
  await Promise.all(activeFiles.map((f) => loadOne(f.name)));

  status.setLoading(false);
}

async function loadOne(name: string): Promise<void> {
  const status = useFlowStatusStore.getState();
  try {
    const xml = await getFlowFileContent(name);
    const parsed = parseFlowXml(xml);
    const built = buildFlow(parsed, name);
    registerSuite(built.tests);
    status.setEntry({
      name,
      status: "implemented",
      flowName: parsed.name,
      testCount: built.tests.length,
    });
  } catch (err) {
    const message = err instanceof FlowXmlParseError
      ? err.message
      : err instanceof Error
        ? err.message
        : String(err);
    status.setEntry({ name, status: "invalid", error: message });
    // eslint-disable-next-line no-console
    console.warn(`[loadFlowsFromQueue] ${name} failed:`, message);
  }
}
