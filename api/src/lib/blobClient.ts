import { BlobServiceClient, ContainerClient, RestError } from "@azure/storage-blob";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";

export const SPEC_CONTAINER = "spec-files";

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
}

/** List all blobs in the container, optionally filtered by prefix (folder path). */
export async function listBlobs(prefix?: string, container?: string): Promise<BlobItem[]> {
  const c = getContainerClient(container);
  const items: BlobItem[] = [];
  const options = prefix ? { prefix } : undefined;
  try {
    for await (const blob of c.listBlobsFlat(options)) {
      items.push({
        name: blob.name,
        size: blob.properties.contentLength ?? 0,
        lastModified: blob.properties.lastModified ?? new Date(),
        contentType: blob.properties.contentType ?? "text/plain",
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
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

/** Delete a blob. */
export async function deleteBlob(name: string, container?: string): Promise<void> {
  const c = getContainerClient(container);
  const blobClient = c.getBlobClient(name);
  await blobClient.deleteIfExists();
}

/** Rename a blob by copying then deleting the source. */
export async function renameBlob(oldName: string, newName: string, container?: string): Promise<void> {
  const c = getContainerClient(container);
  const sourceClient = c.getBlockBlobClient(oldName);
  const destClient = c.getBlockBlobClient(newName);
  await destClient.beginCopyFromURL(sourceClient.url);
  await sourceClient.deleteIfExists();
}
