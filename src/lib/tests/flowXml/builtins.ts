// Built-in reference flows that ship with the app. On first load (or any
// time they are missing or outdated in blob storage) we push them so the
// user has a consistent baseline of working examples.

import versionLifecycleXml from "../../../../customer_api_endpoint_md_files/flows/articles/article-version-lifecycle.flow.xml?raw";
import fullCrudXml from "../../../../customer_api_endpoint_md_files/flows/articles/full-article-crud-lifecycle.flow.xml?raw";
import settingsXml from "../../../../customer_api_endpoint_md_files/flows/articles/article-settings-flow.flow.xml?raw";
import bulkOpsXml from "../../../../customer_api_endpoint_md_files/flows/articles/bulk-operations.flow.xml?raw";
import publishUnpublishXml from "../../../../customer_api_endpoint_md_files/flows/articles/publish-unpublish-flow.flow.xml?raw";
import versionMgmtXml from "../../../../customer_api_endpoint_md_files/flows/articles/version-management.flow.xml?raw";
import { listFlowFiles, getFlowFileContent, saveFlowFile } from "../../api/flowFilesApi";

export interface BuiltinFlow {
  name: string;       // blob name
  xml: string;
}

export const BUILTIN_FLOWS: BuiltinFlow[] = [
  { name: "v3/articles/article-version-lifecycle.flow.xml", xml: versionLifecycleXml },
  { name: "v3/articles/full-article-crud-lifecycle.flow.xml", xml: fullCrudXml },
  { name: "v3/articles/article-settings-flow.flow.xml", xml: settingsXml },
  { name: "v3/articles/bulk-operations.flow.xml", xml: bulkOpsXml },
  { name: "v3/articles/publish-unpublish-flow.flow.xml", xml: publishUnpublishXml },
  { name: "v3/articles/version-management.flow.xml", xml: versionMgmtXml },
];

/** Normalise whitespace for comparison (trim + collapse runs of whitespace). */
function normalise(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Push every built-in flow into the queue. If the blob already exists but
 * its content differs from the bundled version (e.g. after a schema change),
 * overwrite it so the user always sees the latest reference flows.
 */
export async function seedBuiltinFlows(): Promise<{ uploaded: string[]; skipped: string[] }> {
  const uploaded: string[] = [];
  const skipped: string[] = [];

  let existingNames: Set<string>;
  try {
    const existing = await listFlowFiles();
    existingNames = new Set(existing.map((f) => f.name));
  } catch {
    existingNames = new Set();
  }

  for (const flow of BUILTIN_FLOWS) {
    try {
      if (existingNames.has(flow.name)) {
        // Check if content matches — if not, overwrite with the updated version
        const remote = await getFlowFileContent(flow.name);
        if (normalise(remote) === normalise(flow.xml)) {
          skipped.push(flow.name);
          continue;
        }
        // Content differs — overwrite
        await saveFlowFile(flow.name, flow.xml, true);
        uploaded.push(flow.name);
      } else {
        await saveFlowFile(flow.name, flow.xml, false);
        uploaded.push(flow.name);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[seedBuiltinFlows] failed to upload ${flow.name}:`, err);
    }
  }

  return { uploaded, skipped };
}
