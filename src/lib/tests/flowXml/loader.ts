// Loads every .flow.xml file from blob storage, parses each into a TestDef[]
// and registers them in the test runner's registry. Updates the flow-status
// store so the Flow Manager UI can reflect implementation status.

import { listFlowFiles, getFlowFileContent } from "../../api/flowFilesApi";
import { useFlowStatusStore } from "../../../store/flowStatus.store";
import { registerSuite, unregisterWhere } from "../registry";
import { parseFlowXml, FlowXmlParseError } from "./parser";
import { buildFlow } from "./builder";
import { seedBuiltinFlows } from "./builtins";

let lastLoadPromise: Promise<void> | null = null;

/**
 * Public entry point. Lists every .flow.xml in the queue, parses each, and
 * registers the resulting TestDefs. Concurrent calls share a single in-flight
 * load so callers don't trigger duplicate work.
 */
export function loadFlowsFromQueue(): Promise<void> {
  if (lastLoadPromise) return lastLoadPromise;
  lastLoadPromise = doLoad().finally(() => { lastLoadPromise = null; });
  return lastLoadPromise;
}

async function doLoad(): Promise<void> {
  const status = useFlowStatusStore.getState();
  status.setLoading(true);

  // Seed the queue with the bundled reference flows on first run.
  // Idempotent — never overwrites user edits.
  try {
    await seedBuiltinFlows();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[loadFlowsFromQueue] seed failed:", err);
  }

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

  // Clean slate — drop every previously registered xml-sourced test and
  // prune status entries for files that no longer exist in the queue.
  // Any current file will be re-added below.
  unregisterWhere((def) => def.id.startsWith("xml:"));
  status.pruneTo(new Set(files.map((f) => f.name)));

  // Mark every known file as "loading" up-front so the UI can show progress.
  for (const f of files) {
    status.setEntry({ name: f.name, status: "loading" });
  }

  // Fetch + parse + register in parallel.
  await Promise.all(files.map((f) => loadOne(f.name)));

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
