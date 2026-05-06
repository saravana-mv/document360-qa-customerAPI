/**
 * Unit tests for the enhance-docs-example Azure Function.
 */

import type { InvocationContext } from "@azure/functions";

// ---------------------------------------------------------------------------
// Mocks (must be declared before importing the module under test)
// ---------------------------------------------------------------------------

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  isSuperOwner: jest.fn().mockResolvedValue(true),
  lookupProjectMember: jest.fn().mockResolvedValue({ role: "qa_manager" }),
  ProjectIdMissingError: class extends Error {},
}));

const mockDownloadBlob = jest.fn();
jest.mock("../lib/blobClient", () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

const mockLoadAiContext = jest.fn().mockResolvedValue({
  rules: "",
  enumAliases: "",
  projectVariables: [],
  dependencyInfo: null,
  specContext: "",
  specSource: "none",
  flowStepSpecs: [],
  enrichSystemPrompt: (p: string) => p,
  formatUserContext: () => "",
  formatFlowStepSpecs: () => "",
});
jest.mock("../lib/aiContext", () => ({
  loadAiContext: (...args: unknown[]) => mockLoadAiContext(...args),
}));

const mockCallAI = jest.fn();
jest.mock("../lib/aiClient", () => ({
  callAI: (...args: unknown[]) => mockCallAI(...args),
  AiConfigError: class extends Error {
    constructor(m: string) { super(m); this.name = "AiConfigError"; }
  },
  CreditDeniedError: class extends Error {
    creditDenied: unknown;
    constructor(b: unknown) { super("denied"); this.name = "CreditDeniedError"; this.creditDenied = b; }
  },
}));

const mockAudit = jest.fn();
jest.mock("../lib/auditLog", () => ({ audit: (...args: unknown[]) => mockAudit(...args) }));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------

import { app } from "@azure/functions";

require("../functions/enhanceDocsExample");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHandler(): (req: unknown, ctx: InvocationContext) => Promise<any> {
  const calls = (app.http as jest.Mock).mock.calls;
  const call = calls.find((c: any[]) => c[0] === "enhanceDocsExample");
  if (!call) throw new Error("enhanceDocsExample not registered via app.http");
  return call[1].handler;
}

function mockRequest(method: string, body?: unknown) {
  return {
    method,
    query: new URLSearchParams(),
    headers: new Map(),
    json: body !== undefined
      ? jest.fn().mockResolvedValue(body)
      : jest.fn().mockRejectedValue(new Error("no body")),
  };
}

const ctx = {} as InvocationContext;

const SAMPLE_MD = `# Create Article

> Creates a new article.

## OpenAPI

\`\`\`\`json POST /v3/articles
${JSON.stringify({
  openapi: "3.0.1",
  paths: {
    "/v3/articles": {
      post: {
        operationId: "createArticle",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              examples: { default: { value: { title: "old" } } },
            },
          },
        },
        responses: {
          "201": {
            description: "Created",
            content: {
              "application/json": {
                schema: { type: "object" },
                examples: { Success: { value: { id: "old-id-123" } } },
              },
            },
          },
        },
      },
    },
  },
}, null, 2)}
\`\`\`\`
`;

function makeAiResponse(slice: unknown, inputTokens = 500, outputTokens = 200) {
  return {
    text: JSON.stringify(slice),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUsd: 0.0042,
      model: "claude-sonnet-4-6",
      source: "enhanceDocsExample",
    },
    raw: {},
  };
}

const VALID_REQUEST = {
  specPath: "v3/articles/create-article.md",
  versionFolder: "v3",
  method: "POST",
  pathTemplate: "/v3/articles",
  capturedUrl: "https://api.example.com/v3/articles",
  capturedStatus: 201,
  requestHeaders: { "Content-Type": "application/json", Authorization: "Bearer secret-abc" },
  requestBody: '{"title":"My Article"}',
  requestContentType: "application/json",
  responseHeaders: { "Content-Type": "application/json" },
  responseBody: { id: "art-real-id-xyz", title: "My Article" },
  responseContentType: "application/json",
};

const VALID_AI_SLICE = {
  requestBody: {
    content: {
      "application/json": {
        schema: { type: "object" },
        examples: { default: { value: { title: "{{proj.articleTitle}}" } } },
      },
    },
  },
  response: {
    status: "201",
    value: {
      description: "Created",
      content: {
        "application/json": {
          schema: { type: "object" },
          examples: { Success: { value: { id: "{{proj.articleId}}", title: "{{proj.articleTitle}}" } } },
        },
      },
    },
  },
  summary: {
    requestBodyExampleName: "default",
    responseExampleName: "Success",
    addedNewExample: false,
  },
};

beforeEach(() => {
  mockDownloadBlob.mockReset();
  mockCallAI.mockReset();
  mockAudit.mockReset();
  mockLoadAiContext.mockClear();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("enhanceDocsExample — registration", () => {
  test("registers as POST /api/spec-files/enhance-example", () => {
    const calls = (app.http as jest.Mock).mock.calls;
    const call = calls.find((c: any[]) => c[0] === "enhanceDocsExample");
    expect(call).toBeDefined();
    expect(call![1].route).toBe("spec-files/enhance-example");
    expect(call![1].methods).toEqual(["POST", "OPTIONS"]);
    expect(call![1].authLevel).toBe("anonymous");
  });
});

describe("OPTIONS", () => {
  test("returns 204 with CORS headers", async () => {
    const handler = getHandler();
    const res = await handler(mockRequest("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
  });
});

describe("validation", () => {
  test("400 invalid_json_body", async () => {
    const res = await getHandler()(mockRequest("POST"), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("invalid_json_body");
  });

  test("400 missing_fields when specPath missing", async () => {
    const { specPath: _specPath, ...rest } = VALID_REQUEST;
    const res = await getHandler()(mockRequest("POST", rest), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("missing_fields");
  });

  test("400 missing_fields when capturedStatus is not a number", async () => {
    const res = await getHandler()(mockRequest("POST", { ...VALID_REQUEST, capturedStatus: "201" }), ctx);
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("missing_fields");
  });

  test("404 spec_not_found when blob read fails", async () => {
    mockDownloadBlob.mockRejectedValue(new Error("not found"));
    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body as string).error).toBe("spec_not_found");
  });

  test("422 no_openapi_block when MD lacks block", async () => {
    mockDownloadBlob.mockResolvedValue("# Just a title\nNo block here.\n");
    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body as string).error).toBe("no_openapi_block");
  });

  test("400 path_template_mismatch when captured URL does not match spec", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    const res = await getHandler()(
      mockRequest("POST", { ...VALID_REQUEST, capturedUrl: "https://api.example.com/v3/categories" }),
      ctx,
    );
    expect(res.status).toBe(400);
    expect(JSON.parse(res.body as string).error).toBe("path_template_mismatch");
  });
});

describe("happy path", () => {
  test("200 with updatedMd, summary, and usage", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI.mockResolvedValueOnce(makeAiResponse(VALID_AI_SLICE));

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.originalMd).toBe(SAMPLE_MD);
    expect(parsed.updatedMd).toContain("{{proj.articleId}}");
    expect(parsed.updatedMd).not.toContain("old-id-123");
    expect(parsed.updatedSliceSummary).toEqual({
      requestBodyExampleName: "default",
      responseExampleName: "Success",
      addedNewExample: false,
      addedNewResponseStatus: false,
    });
    expect(parsed.usage.costUsd).toBe(0.0042);
  });

  test("preserves the markdown wrapper byte-equal outside the JSON block", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI.mockResolvedValueOnce(makeAiResponse(VALID_AI_SLICE));

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.updatedMd.startsWith("# Create Article\n")).toBe(true);
    expect(parsed.updatedMd).toContain("> Creates a new article.");
    expect(parsed.updatedMd).toContain("## OpenAPI");
    expect(parsed.updatedMd).toMatch(/````json POST \/v3\/articles\n/);
  });

  test("addedNewResponseStatus=true when status was new", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    const slice422 = {
      requestBody: null,
      response: {
        status: "422",
        value: {
          description: "Unprocessable Entity",
          content: {
            "application/json": {
              schema: { type: "object" },
              examples: { "tryit-422": { value: { error: "validation failed" } } },
            },
          },
        },
      },
      summary: { requestBodyExampleName: null, responseExampleName: "tryit-422", addedNewExample: true },
    };
    mockCallAI.mockResolvedValueOnce(makeAiResponse(slice422));

    const res = await getHandler()(
      mockRequest("POST", { ...VALID_REQUEST, capturedStatus: 422 }),
      ctx,
    );
    expect(res.status).toBe(200);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.updatedSliceSummary.addedNewResponseStatus).toBe(true);
    expect(parsed.updatedMd).toContain('"422"');
  });

  test("audit fired with spec.enhance_example", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI.mockResolvedValueOnce(makeAiResponse(VALID_AI_SLICE));
    await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(mockAudit).toHaveBeenCalledWith(
      "test-project",
      "spec.enhance_example",
      expect.objectContaining({ oid: "test-oid" }),
      VALID_REQUEST.specPath,
      expect.objectContaining({ capturedStatus: 201, addedNewResponseStatus: false }),
    );
  });

  test("Authorization header value is stripped before AI sees it", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI.mockResolvedValueOnce(makeAiResponse(VALID_AI_SLICE));
    await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    const callArg = mockCallAI.mock.calls[0][0];
    const userMessage = callArg.messages[0].content as string;
    expect(userMessage).not.toContain("Bearer secret-abc");
    expect(userMessage).not.toContain("secret-abc");
  });
});

describe("safety net", () => {
  test("422 redaction_incomplete when AI leaves the captured Authorization value in output", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    const leakySlice = {
      requestBody: null,
      response: {
        status: "201",
        value: {
          description: "Created",
          content: {
            "application/json": {
              examples: {
                Success: { value: { id: "leaked", note: "Bearer secret-abc was the auth header" } },
              },
            },
          },
        },
      },
      summary: { requestBodyExampleName: null, responseExampleName: "Success", addedNewExample: false },
    };
    mockCallAI.mockResolvedValueOnce(makeAiResponse(leakySlice));

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body as string).error).toBe("redaction_incomplete");
  });
});

describe("retry on invalid JSON", () => {
  test("retries once when first response is malformed, succeeds on retry", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI
      .mockResolvedValueOnce({ text: "not json at all", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001, model: "claude-sonnet-4-6", source: "enhanceDocsExample" }, raw: {} })
      .mockResolvedValueOnce(makeAiResponse(VALID_AI_SLICE));

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(200);
    expect(mockCallAI).toHaveBeenCalledTimes(2);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.usage.costUsd).toBeCloseTo(0.0052, 4);
  });

  test("422 ai_invalid_json when both attempts fail", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    mockCallAI.mockResolvedValue({ text: "still not json", usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.001, model: "claude-sonnet-4-6", source: "enhanceDocsExample" }, raw: {} });

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(422);
    expect(JSON.parse(res.body as string).error).toBe("ai_invalid_json");
  });
});

describe("credit denied", () => {
  test("402 credit_denied when CreditDeniedError thrown", async () => {
    mockDownloadBlob.mockResolvedValue(SAMPLE_MD);
    const { CreditDeniedError } = require("../lib/aiClient");
    mockCallAI.mockRejectedValueOnce(new CreditDeniedError({ reason: "budget exhausted" }));

    const res = await getHandler()(mockRequest("POST", VALID_REQUEST), ctx);
    expect(res.status).toBe(402);
    const parsed = JSON.parse(res.body as string);
    expect(parsed.error).toBe("credit_denied");
    expect(parsed.reason).toBe("budget exhausted");
  });
});
