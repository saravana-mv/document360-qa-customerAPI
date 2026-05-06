import { getProjectHeaders } from "./projectHeader";

export interface EnhanceDocsExampleRequest {
  specPath: string;
  versionFolder: string;
  method: string;
  pathTemplate: string;
  capturedUrl: string;
  capturedStatus: number;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  requestContentType?: string;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  responseContentType?: string;
  model?: string;
}

export interface EnhanceDocsExampleResponse {
  originalMd: string;
  updatedMd: string;
  /** The updated paths[pathTemplate][method] object — splice this back into _swagger.json on save. */
  updatedOperation: Record<string, unknown>;
  pathTemplate: string;
  method: string;
  updatedSliceSummary: {
    requestBodyExampleName: string | null;
    responseExampleName: string | null;
    addedNewExample: boolean;
    addedNewResponseStatus: boolean;
  };
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
}

export class EnhanceDocsExampleError extends Error {
  status: number;
  code: string;
  extra: Record<string, unknown>;
  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export async function enhanceDocsExample(
  req: EnhanceDocsExampleRequest,
  signal?: AbortSignal,
): Promise<EnhanceDocsExampleResponse> {
  const res = await fetch(`/api/spec-files/enhance-example`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
    body: JSON.stringify(req),
    signal,
  });

  if (!res.ok) {
    let code = res.statusText;
    let extra: Record<string, unknown> = {};
    try {
      const parsed = (await res.clone().json()) as { error?: string } & Record<string, unknown>;
      if (parsed && typeof parsed.error === "string") {
        code = parsed.error;
        const { error: _err, ...rest } = parsed;
        extra = rest;
      }
    } catch {
      /* ignore */
    }
    throw new EnhanceDocsExampleError(res.status, code, code, extra);
  }

  return (await res.json()) as EnhanceDocsExampleResponse;
}
