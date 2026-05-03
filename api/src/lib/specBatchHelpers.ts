import { uploadBlob, deleteBlob } from "./blobClient";
import { distillAndStoreWithResult } from "./specDistillCache";

/** Upload files in parallel batches to stay within limits. */
export async function batchUpload(
  items: Array<{ blobPath: string; content: string }>,
  batchSize: number,
): Promise<void> {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(
      batch.map(({ blobPath, content }) =>
        uploadBlob(blobPath, content, "text/markdown"),
      ),
    );
  }
}

export interface DistillResult {
  file: string;
  status: "distilled" | "unchanged" | "error";
  error?: string;
}

/** Delete blobs in parallel batches. Returns count of deleted and failed. */
export async function batchDelete(
  blobNames: string[],
  batchSize: number,
): Promise<{ deleted: number; failed: number }> {
  let deleted = 0;
  let failed = 0;
  for (let i = 0; i < blobNames.length; i += batchSize) {
    const batch = blobNames.slice(i, i + batchSize);
    const outcomes = await Promise.allSettled(
      batch.map((name) => deleteBlob(name)),
    );
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") deleted++;
      else failed++;
    }
  }
  return { deleted, failed };
}

/** Awaited batch distillation that collects per-file results. */
export async function batchDistillAll(
  items: Array<{ blobPath: string; content: string }>,
  batchSize: number,
): Promise<DistillResult[]> {
  const results: DistillResult[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async ({ blobPath, content }): Promise<DistillResult> => {
        try {
          const status = await distillAndStoreWithResult(blobPath, content);
          return { file: blobPath, status };
        } catch (e) {
          return {
            file: blobPath,
            status: "error",
            error: e instanceof Error ? e.message : String(e),
          };
        }
      }),
    );
    results.push(...batchResults);
  }
  return results;
}
