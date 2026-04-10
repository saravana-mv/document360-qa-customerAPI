import { BlobServiceClient, ContainerClient } from "@azure/storage-blob";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const CONTAINER_NAME = "spec-files";

let _containerClient: ContainerClient | null = null;

function getContainerClient(): ContainerClient {
  if (_containerClient) return _containerClient;
  if (!CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
  const serviceClient = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
  _containerClient = serviceClient.getContainerClient(CONTAINER_NAME);
  return _containerClient;
}

export interface BlobItem {
  name: string;
  size: number;
  lastModified: Date;
  contentType: string;
}

/** List all blobs in the container, optionally filtered by prefix (folder path). */
export async function listBlobs(prefix?: string): Promise<BlobItem[]> {
  const container = getContainerClient();
  const items: BlobItem[] = [];
  const options = prefix ? { prefix } : undefined;
  for await (const blob of container.listBlobsFlat(options)) {
    items.push({
      name: blob.name,
      size: blob.properties.contentLength ?? 0,
      lastModified: blob.properties.lastModified ?? new Date(),
      contentType: blob.properties.contentType ?? "text/plain",
    });
  }
  return items;
}

/** Download a blob's text content. */
export async function downloadBlob(name: string): Promise<string> {
  const container = getContainerClient();
  const blobClient = container.getBlobClient(name);
  const response = await blobClient.download();
  const chunks: Buffer[] = [];
  for await (const chunk of response.readableStreamBody as AsyncIterable<Buffer>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/** Upload or overwrite a blob with text content. */
export async function uploadBlob(name: string, content: string, contentType = "text/plain"): Promise<void> {
  const container = getContainerClient();
  await container.createIfNotExists();
  const blockBlobClient = container.getBlockBlobClient(name);
  const buffer = Buffer.from(content, "utf-8");
  await blockBlobClient.upload(buffer, buffer.length, {
    blobHTTPHeaders: { blobContentType: contentType },
  });
}

/** Delete a blob. */
export async function deleteBlob(name: string): Promise<void> {
  const container = getContainerClient();
  const blobClient = container.getBlobClient(name);
  await blobClient.deleteIfExists();
}

/** Rename a blob by copying then deleting the source. */
export async function renameBlob(oldName: string, newName: string): Promise<void> {
  const container = getContainerClient();
  const sourceClient = container.getBlockBlobClient(oldName);
  const destClient = container.getBlockBlobClient(newName);
  await destClient.beginCopyFromURL(sourceClient.url);
  await sourceClient.deleteIfExists();
}
