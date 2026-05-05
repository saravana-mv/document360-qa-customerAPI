import { BlobServiceClient, ContainerClient, RestError } from "@azure/storage-blob";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";

export const SPEC_CONTAINER = process.env.BLOB_SPEC_CONTAINER ?? "spec-files";

const _clientCache: Record<string, ContainerClient> = {};

function getContainerClient(container: string = SPEC_CONTAINER): ContainerClient {
  if (_clientCache[container]) return _clientCache[container];
  if (!CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  const serviceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  _clientCache[container] = serviceClient.getContainerClient(container);
  return _clientCache[container];
}

export interface BlobItem {
  name: string;
  size: number;
  lastModified: Date;
  contentType: string;
  httpMethod?: string;
}

/** List all blobs in the container, optionally filtered by prefix (folder path). */
export async function listBlobs(prefix?: string, container?: string): Promise<BlobItem[]> {
  const c = getContainerClient(container);
  const items: BlobItem[] = [];
  const options = prefix ? { prefix, includeMetadata: true } : { includeMetadata: true };
  try {
    for await (const blob of c.listBlobsFlat(options)) {
      items.push({
        name: blob.name,
        size: blob.properties.contentLength ?? 0,
        lastModified: blob.properties.lastModified ?? new Date(),
        contentType: blob.properties.contentType ?? "text/plain",
        httpMethod: blob.metadata?.httpmethod || undefined,
      });
    }
  } catch (e) {
    // Container may not exist yet — return empty list
    if (e instanceof RestError && e.statusCode === 404) return [];
    throw e;
  }
  return items;
}

/** Download a blob's text content. */
export async function downloadBlob(name: string, container?: string): Promise<string> {
  const c = getContainerClient(container);
  const blobClient = c.getBlobClient(name);
  const response = await blobClient.download();
  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Check if a blob exists. */
export async function blobExists(name: string, container?: string): Promise<boolean> {
  const c = getContainerClient(container);
  try {
    return await c.getBlobClient(name).exists();
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return false;
    throw e;
  }
}

/**
 * Detect HTTP method from spec file content.
 * Looks for patterns like: ```json POST /v3/... or ## POST or **POST** `/api/...`
 */
function detectHttpMethod(content: string): string | undefined {
  // Pattern 1: fenced code block with method — ```json POST /path
  const fencedMatch = content.match(/```\w*\s+(GET|POST|PUT|PATCH|DELETE)\s+\//i);
  if (fencedMatch) return fencedMatch[1].toUpperCase();

  // Pattern 2: markdown heading with method — ## GET /path or # POST
  const headingMatch = content.match(/^#{1,3}\s+(GET|POST|PUT|PATCH|DELETE)\b/im);
  if (headingMatch) return headingMatch[1].toUpperCase();

  // Pattern 3: bold method — **POST** or **GET**
  const boldMatch = content.match(/\*\*(GET|POST|PUT|PATCH|DELETE)\*\*/i);
  if (boldMatch) return boldMatch[1].toUpperCase();

  // Pattern 4: "method": "POST" in JSON
  const jsonMatch = content.match(/"method"\s*:\s*"(GET|POST|PUT|PATCH|DELETE)"/i);
  if (jsonMatch) return jsonMatch[1].toUpperCase();

  return undefined;
}

/** Upload or overwrite a blob with text content. */
export async function uploadBlob(
  name: string,
  content: string,
  contentType = "text/plain",
  container?: string
): Promise<void> {
  const c = getContainerClient(container);
  await c.createIfNotExists();
  const blockBlobClient = c.getBlockBlobClient(name);
  const buffer = Buffer.from(content, "utf-8");

  // Detect HTTP method from content for .md spec files
  const metadata: Record<string, string> = {};
  if (name.endsWith(".md") && content.length > 0) {
    const method = detectHttpMethod(content.slice(0, 2000));
    if (method) metadata.httpmethod = method;
  }

  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  });
}

/** Upload binary content (Buffer) to blob storage. */
export async function uploadBlobBuffer(
  name: string,
  buffer: Buffer,
  contentType: string,
  container?: string,
): Promise<void> {
  const c = getContainerClient(container);
  await c.createIfNotExists();
  const blockBlobClient = c.getBlockBlobClient(name);
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

/** Download blob as raw Buffer (for binary files). */
export async function downloadBlobBuffer(
  name: string,
  container?: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  const c = getContainerClient(container);
  const blobClient = c.getBlobClient(name);
  const response = await blobClient.download();
  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return {
    buffer: Buffer.concat(chunks),
    contentType: response.contentType ?? "application/octet-stream",
  };
}

/** Delete a blob. */
export async function deleteBlob(name: string, container?: string): Promise<void> {
  const c = getContainerClient(container);
  const blobClient = c.getBlobClient(name);
  await blobClient.deleteIfExists();
}

export interface BatchDeleteResult {
  deleted: number;
  failed: number;
  errors: string[];
}

/**
 * List all blobs under a prefix and delete them in batches.
 * Reusable primitive for bulk delete operations (folder delete, project delete).
 */
export async function batchDeleteByPrefix(
  prefix: string,
  batchSize = 50,
  container?: string,
): Promise<BatchDeleteResult> {
  const blobs = await listBlobs(prefix, container);
  const result: BatchDeleteResult = { deleted: 0, failed: 0, errors: [] };

  for (let i = 0; i < blobs.length; i += batchSize) {
    const batch = blobs.slice(i, i + batchSize);
    const outcomes = await Promise.allSettled(
      batch.map((b) => deleteBlob(b.name, container)),
    );
    for (const outcome of outcomes) {
      if (outcome.status === "fulfilled") {
        result.deleted++;
      } else {
        result.failed++;
        result.errors.push(outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason));
      }
    }
  }

  return result;
}

/** Rename a blob by copying then deleting the source. */
export async function renameBlob(oldName: string, newName: string, container?: string): Promise<void> {
  const c = getContainerClient(container);
  const sourceClient = c.getBlockBlobClient(oldName);
  const destClient = c.getBlockBlobClient(newName);
  await destClient.beginCopyFromURL(sourceClient.url);
  await sourceClient.deleteIfExists();
}
