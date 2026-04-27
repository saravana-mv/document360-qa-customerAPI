import { uploadBlob } from "./blobClient";
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
