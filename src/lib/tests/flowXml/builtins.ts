// Built-in reference flows that ship with the app. On first load (or any
// time they are missing from the queue) we push them into blob storage so
// the user has a consistent baseline of working examples.

import versionLifecycleXml from "../../../../customer_api_endpoint_md_files/flows/articles/article-version-lifecycle.flow.xml?raw";
import fullCrudXml from "../../../../customer_api_endpoint_md_files/flows/articles/full-article-crud-lifecycle.flow.xml?raw";
import settingsXml from "../../../../customer_api_endpoint_md_files/flows/articles/article-settings-flow.flow.xml?raw";
import { listFlowFiles, saveFlowFile, FlowFileConflictError } from "../../api/flowFilesApi";

export interface BuiltinFlow {
  name: string;       // blob name
  xml: string;
}

export const BUILTIN_FLOWS: BuiltinFlow[] = [
  { name: "v3/articles/article-version-lifecycle.flow.xml", xml: versionLifecycleXml },
  { name: "v3/articles/full-article-crud-lifecycle.flow.xml", xml: fullCrudXml },
  { name: "v3/articles/article-settings-flow.flow.xml", xml: settingsXml },
];

/**
 * Push every built-in flow into the queue if it isn't already there.
 * Idempotent — never overwrites a user-edited copy.
 */
export async function seedBuiltinFlows(): Promise<{ uploaded: string[]; skipped: string[] }> {
  const uploaded: string[] = [];
  const skipped: string[] = [];

  let existingNames: Set<string>;
  try {
    const existing = await listFlowFiles();
    existingNames = new Set(existing.map((f) => f.name));
  } catch {
    // If listing fails we still attempt uploads — saveFlowFile will throw on conflict.
    existingNames = new Set();
  }

  for (const flow of BUILTIN_FLOWS) {
    if (existingNames.has(flow.name)) {
      skipped.push(flow.name);
      continue;
    }
    try {
      await saveFlowFile(flow.name, flow.xml, false);
      uploaded.push(flow.name);
    } catch (err) {
      if (err instanceof FlowFileConflictError) {
        skipped.push(flow.name);
      } else {
        // Don't let a single seed failure block the rest.
        // eslint-disable-next-line no-console
        console.warn(`[seedBuiltinFlows] failed to upload ${flow.name}:`, err);
      }
    }
  }

  return { uploaded, skipped };
}
