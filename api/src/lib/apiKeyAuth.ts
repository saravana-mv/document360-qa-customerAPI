// Middleware for authenticating FlowForge Public API requests via API key.
//
// Reads the X-API-Key header, hashes it, and looks up the matching key doc.
// Returns the resolved credential context needed by the server-side runner.

import type { HttpRequest, HttpResponseInit } from "@azure/functions";
import { hashKey, findApiKeyByHash, touchApiKey } from "./apiKeyStore";
import type { ApiKeyDocument } from "./apiKeyStore";
import { getValidAccessToken } from "./d360Token";
import { getApiKeyForVersion } from "./versionApiKeyStore";
import type { RunContext } from "./flowRunner/types";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
  "Content-Type": "application/json",
};

export interface AuthenticatedContext {
  apiKeyDoc: ApiKeyDocument;
  runContext: Partial<RunContext>;
}

/**
 * Wraps a handler that requires API-key authentication.
 * Injects the resolved ApiKeyDocument into the request headers as JSON
 * so the handler can read it via `getApiKeyDoc(req)`.
 */
export function withApiKey<T extends unknown[]>(
  handler: (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit>,
): (req: HttpRequest, ...rest: T) => Promise<HttpResponseInit> {
  return async (req: HttpRequest, ...rest: T): Promise<HttpResponseInit> => {
    if (req.method === "OPTIONS") {
      return { status: 204, headers: CORS_HEADERS };
    }

    const rawKey = req.headers.get("x-api-key");
    if (!rawKey || !rawKey.startsWith("ff_")) {
      return {
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Missing or invalid X-API-Key header" }),
      };
    }

    const doc = await findApiKeyByHash(hashKey(rawKey));
    if (!doc) {
      return {
        status: 401,
        headers: CORS_HEADERS,
        body: JSON.stringify({ error: "Invalid API key" }),
      };
    }

    // Stash the doc for the handler to retrieve
    (req as unknown as Record<string, unknown>).__apiKeyDoc = doc;

    // Fire-and-forget: update lastUsedAt
    touchApiKey(doc);

    return handler(req, ...rest);
  };
}

/** Retrieve the ApiKeyDocument stashed by withApiKey. */
export function getApiKeyDoc(req: HttpRequest): ApiKeyDocument {
  return (req as unknown as Record<string, unknown>).__apiKeyDoc as ApiKeyDocument;
}

/**
 * Build the D360 credential portion of RunContext from the API key's
 * bound version + auth method.
 */
export async function resolveD360Credentials(
  doc: ApiKeyDocument,
): Promise<{ d360AccessToken?: string; d360ApiKey?: string }> {
  if (doc.authMethod === "oauth") {
    // Use the key creator's stored OAuth token
    const { accessToken } = await getValidAccessToken(doc.createdBy.oid);
    return { d360AccessToken: accessToken };
  }
  // API key auth — read from version API key store
  const apiKey = await getApiKeyForVersion(doc.createdBy.oid, doc.versionId);
  if (!apiKey) {
    throw new Error("No D360 API key configured for this version");
  }
  return { d360ApiKey: apiKey };
}
