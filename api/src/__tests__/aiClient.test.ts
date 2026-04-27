/**
 * Unit tests for api/src/lib/aiClient.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Mocks ───────────────────────────────────────────────────────────────────

const mockCreate = jest.fn();
const mockStream = jest.fn();

jest.mock("@anthropic-ai/sdk", () => {
  return jest.fn().mockImplementation(() => ({
    messages: { create: mockCreate, stream: mockStream },
  }));
});

jest.mock("../lib/modelPricing", () => ({
  resolveModel: jest.fn((requested: string | undefined, fallback: string) => requested || fallback),
  computeCost: jest.fn(() => 0.005),
  DEFAULT_FLOW_MODEL: "claude-sonnet-4-6",
}));

jest.mock("../lib/aiCredits", () => ({
  checkCredits: jest.fn().mockResolvedValue({ allowed: true }),
  recordUsage: jest.fn().mockResolvedValue(undefined),
}));

// ── Imports (after mocks) ───────────────────────────────────────────────────

import Anthropic from "@anthropic-ai/sdk";
import { resolveModel, computeCost } from "../lib/modelPricing";
import { checkCredits, recordUsage } from "../lib/aiCredits";

// We need to re-import the module fresh for singleton tests,
// so we use a helper that requires the module and resets the singleton.
function freshModule() {
  // Clear the cached module so the singleton resets
  const modulePath = require.resolve("../lib/aiClient");
  delete require.cache[modulePath];
  return require("../lib/aiClient") as typeof import("../lib/aiClient");
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const MOCK_RESPONSE = {
  content: [{ type: "text", text: "Hello" }],
  usage: { input_tokens: 100, output_tokens: 50 },
};

const BASE_CALL_OPTS = {
  source: "generateFlow" as const,
  system: "You are a test assistant",
  messages: [{ role: "user" as const, content: "Hi" }],
  maxTokens: 1024,
};

const CREDITS = {
  projectId: "proj-1",
  userId: "user-1",
  displayName: "Test User",
};

// ── Test suites ─────────────────────────────────────────────────────────────

describe("aiClient", () => {
  let savedKey: string | undefined;

  beforeEach(() => {
    savedKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "test-key-123";
    jest.clearAllMocks();
    mockCreate.mockResolvedValue(MOCK_RESPONSE);
    mockStream.mockReturnValue({ fake: "stream" });
  });

  afterEach(() => {
    if (savedKey !== undefined) {
      process.env.ANTHROPIC_API_KEY = savedKey;
    } else {
      delete process.env.ANTHROPIC_API_KEY;
    }
  });

  // ── getAiClient ─────────────────────────────────────────────────────────

  describe("getAiClient", () => {
    it("throws AiConfigError when ANTHROPIC_API_KEY is not set", () => {
      delete process.env.ANTHROPIC_API_KEY;
      const mod = freshModule();
      expect(() => mod.getAiClient()).toThrow(mod.AiConfigError);
      expect(() => mod.getAiClient()).toThrow("ANTHROPIC_API_KEY is not configured");
    });

    it("returns an Anthropic instance when key is set", () => {
      const mod = freshModule();
      const client = mod.getAiClient();
      expect(client).toBeDefined();
      expect(Anthropic).toHaveBeenCalledWith({ apiKey: "test-key-123" });
    });

    it("returns the same instance on repeated calls (singleton)", () => {
      const mod = freshModule();
      const first = mod.getAiClient();
      const second = mod.getAiClient();
      expect(first).toBe(second);
    });
  });

  // ── callAI ──────────────────────────────────────────────────────────────

  describe("callAI", () => {
    it("calls Anthropic messages.create with correct params", async () => {
      const mod = freshModule();
      await mod.callAI(BASE_CALL_OPTS);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "You are a test assistant",
        messages: [{ role: "user", content: "Hi" }],
      });
    });

    it("returns text, usage, and raw response", async () => {
      const mod = freshModule();
      const result = await mod.callAI(BASE_CALL_OPTS);

      expect(result.text).toBe("Hello");
      expect(result.usage).toEqual({
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        costUsd: 0.005,
        model: "claude-sonnet-4-6",
        source: "generateFlow",
      });
      expect(result.raw).toBe(MOCK_RESPONSE);
    });

    it("checks credits when credits param provided", async () => {
      const mod = freshModule();
      await mod.callAI({ ...BASE_CALL_OPTS, credits: CREDITS });

      expect(checkCredits).toHaveBeenCalledWith("proj-1", "user-1", "Test User");
    });

    it("skips credit check when credits omitted", async () => {
      const mod = freshModule();
      await mod.callAI(BASE_CALL_OPTS);

      expect(checkCredits).not.toHaveBeenCalled();
    });

    it("records usage after successful call", async () => {
      const mod = freshModule();
      await mod.callAI({ ...BASE_CALL_OPTS, credits: CREDITS });

      expect(recordUsage).toHaveBeenCalledWith("proj-1", "user-1", "Test User", 0.005);
    });

    it("throws CreditDeniedError when credits exhausted", async () => {
      (checkCredits as jest.Mock).mockResolvedValueOnce({
        allowed: false,
        reason: "exhausted",
      });

      const mod = freshModule();
      try {
        await mod.callAI({ ...BASE_CALL_OPTS, credits: CREDITS });
        fail("Expected CreditDeniedError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(mod.CreditDeniedError);
        expect(err.creditDenied).toEqual({
          reason: "exhausted",
          projectCredits: undefined,
          userCredits: undefined,
        });
      }

      // Should NOT have called the API or recorded usage
      expect(mockCreate).not.toHaveBeenCalled();
      expect(recordUsage).not.toHaveBeenCalled();
    });

    it("uses requestedModel when provided", async () => {
      const mod = freshModule();
      await mod.callAI({ ...BASE_CALL_OPTS, requestedModel: "claude-opus-4-6" });

      expect(resolveModel).toHaveBeenCalledWith("claude-opus-4-6", "claude-sonnet-4-6");
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ model: "claude-opus-4-6" }),
      );
    });
  });

  // ── streamAI ────────────────────────────────────────────────────────────

  describe("streamAI", () => {
    it("returns stream and finalize function", async () => {
      const mod = freshModule();
      const result = await mod.streamAI(BASE_CALL_OPTS);

      expect(result.stream).toEqual({ fake: "stream" });
      expect(result.model).toBe("claude-sonnet-4-6");
      expect(typeof result.finalize).toBe("function");

      expect(mockStream).toHaveBeenCalledWith({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: "You are a test assistant",
        messages: [{ role: "user", content: "Hi" }],
      });
    });

    it("finalize() computes cost and records usage", async () => {
      const mod = freshModule();
      const result = await mod.streamAI({ ...BASE_CALL_OPTS, credits: CREDITS });

      const finalMsg = {
        content: [{ type: "text", text: "Done" }],
        usage: { input_tokens: 200, output_tokens: 100 },
      } as any;

      const usage = await result.finalize(finalMsg);

      expect(computeCost).toHaveBeenCalledWith("claude-sonnet-4-6", 200, 100);
      expect(usage).toEqual({
        inputTokens: 200,
        outputTokens: 100,
        totalTokens: 300,
        costUsd: 0.005,
        model: "claude-sonnet-4-6",
        source: "generateFlow",
      });
      expect(recordUsage).toHaveBeenCalledWith("proj-1", "user-1", "Test User", 0.005);
    });

    it("finalize() skips recording when credits omitted", async () => {
      const mod = freshModule();
      const result = await mod.streamAI(BASE_CALL_OPTS);

      const finalMsg = {
        content: [{ type: "text", text: "Done" }],
        usage: { input_tokens: 50, output_tokens: 25 },
      } as any;

      await result.finalize(finalMsg);

      expect(recordUsage).not.toHaveBeenCalled();
    });

    it("checks credits when credits param provided", async () => {
      const mod = freshModule();
      await mod.streamAI({ ...BASE_CALL_OPTS, credits: CREDITS });

      expect(checkCredits).toHaveBeenCalledWith("proj-1", "user-1", "Test User");
    });

    it("throws CreditDeniedError when credits exhausted", async () => {
      (checkCredits as jest.Mock).mockResolvedValueOnce({
        allowed: false,
        reason: "exhausted",
      });

      const mod = freshModule();
      try {
        await mod.streamAI({ ...BASE_CALL_OPTS, credits: CREDITS });
        fail("Expected CreditDeniedError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(mod.CreditDeniedError);
        expect(err.creditDenied.reason).toBe("exhausted");
      }

      expect(mockStream).not.toHaveBeenCalled();
    });
  });
});
