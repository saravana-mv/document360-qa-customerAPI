// Centralized AI client for all Anthropic API calls.
// Single point of control for: client creation, model resolution,
// credit checking, API calls, cost computation, and usage recording.

import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { resolveModel, computeCost, DEFAULT_FLOW_MODEL } from "./modelPricing";
import type { ModelId } from "./modelPricing";
import { checkCredits, recordUsage } from "./aiCredits";

// ── Source identifiers — every AI call is tagged ────────────────────────────

export type AiSource =
  | "generateFlow"
  | "generateFlowIdeas"
  | "editFlow"
  | "flowChat"
  | "skillsChat"
  | "debugAnalyze"
  | "generateTitle"
;

// Per-source default model overrides (extensible, empty by default).
// All sources default to Sonnet 4.6 (DEFAULT_FLOW_MODEL) unless overridden.
const SOURCE_DEFAULT_MODEL: Partial<Record<AiSource, ModelId>> = {
  // Example: debugAnalyze: "claude-opus-4-6"
};

// ── Singleton client ────────────────────────────────────────────────────────

let _client: Anthropic | null = null;

export function getAiClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new AiConfigError("ANTHROPIC_API_KEY is not configured");
  _client = new Anthropic({ apiKey });
  return _client;
}

// ── Error types ─────────────────────────────────────────────────────────────

export class AiConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigError";
  }
}

export class CreditDeniedError extends Error {
  creditDenied: { reason: string; projectCredits?: unknown; userCredits?: unknown };
  constructor(body: { reason: string; projectCredits?: unknown; userCredits?: unknown }) {
    super(body.reason);
    this.name = "CreditDeniedError";
    this.creditDenied = body;
  }
}

// ── Usage result ────────────────────────────────────────────────────────────

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  model: string;
  source: AiSource;
}

// ── callAI — non-streaming ──────────────────────────────────────────────────

export interface CallAiOptions {
  source: AiSource;
  system: string;
  messages: MessageParam[];
  maxTokens: number;
  requestedModel?: string;
  defaultModel?: ModelId;
  credits?: {
    projectId: string;
    userId: string;
    displayName: string;
  };
}

export interface CallAiResult {
  text: string;
  usage: AiUsage;
  raw: Anthropic.Message;
}

export async function callAI(opts: CallAiOptions): Promise<CallAiResult> {
  const client = getAiClient();
  const model = resolveModel(
    opts.requestedModel,
    SOURCE_DEFAULT_MODEL[opts.source] ?? opts.defaultModel ?? DEFAULT_FLOW_MODEL,
  );

  // Credit check
  if (opts.credits) {
    await enforceCredits(opts.credits);
  }

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  });

  const text = extractText(response);
  const usage = buildUsage(model, response.usage, opts.source);

  // Record usage
  if (opts.credits) {
    await safeRecordUsage(opts.credits, usage.costUsd, opts.source);
  }

  return { text, usage, raw: response };
}

// ── streamAI — streaming ────────────────────────────────────────────────────

export interface StreamAiOptions {
  source: AiSource;
  system: string;
  messages: MessageParam[];
  maxTokens: number;
  requestedModel?: string;
  defaultModel?: ModelId;
  credits?: {
    projectId: string;
    userId: string;
    displayName: string;
  };
}

export interface StreamAiResult {
  stream: ReturnType<Anthropic["messages"]["stream"]>;
  model: ModelId;
  finalize: (msg: Anthropic.Message) => Promise<AiUsage>;
}

export async function streamAI(opts: StreamAiOptions): Promise<StreamAiResult> {
  const client = getAiClient();
  const model = resolveModel(
    opts.requestedModel,
    SOURCE_DEFAULT_MODEL[opts.source] ?? opts.defaultModel ?? DEFAULT_FLOW_MODEL,
  );

  // Credit check
  if (opts.credits) {
    await enforceCredits(opts.credits);
  }

  const stream = client.messages.stream({
    model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: opts.messages,
  });

  const finalize = async (msg: Anthropic.Message): Promise<AiUsage> => {
    const usage = buildUsage(model, msg.usage, opts.source);
    if (opts.credits) {
      await safeRecordUsage(opts.credits, usage.costUsd, opts.source);
    }
    return usage;
  };

  return { stream, model, finalize };
}

// ── Internal helpers ────────────────────────────────────────────────────────

function extractText(response: Anthropic.Message): string {
  const block = response.content.find((b) => b.type === "text");
  return block && block.type === "text" ? block.text : "";
}

function buildUsage(
  model: ModelId,
  raw: { input_tokens: number; output_tokens: number },
  source: AiSource,
): AiUsage {
  const inputTokens = raw.input_tokens;
  const outputTokens = raw.output_tokens;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: computeCost(model, inputTokens, outputTokens),
    model,
    source,
  };
}

async function enforceCredits(credits: {
  projectId: string;
  userId: string;
  displayName: string;
}): Promise<void> {
  if (credits.projectId === "unknown") return;
  try {
    const result = await checkCredits(credits.projectId, credits.userId, credits.displayName);
    if (!result.allowed) {
      throw new CreditDeniedError({
        reason: result.reason ?? "AI credits exhausted",
        projectCredits: result.projectCredits,
        userCredits: result.userCredits,
      });
    }
  } catch (e) {
    if (e instanceof CreditDeniedError) throw e;
    console.warn("[aiClient] credit check failed, proceeding:", e);
  }
}

async function safeRecordUsage(
  credits: { projectId: string; userId: string; displayName: string },
  costUsd: number,
  source: AiSource,
): Promise<void> {
  if (credits.projectId === "unknown") return;
  try {
    await recordUsage(credits.projectId, credits.userId, credits.displayName, costUsd);
  } catch (e) {
    console.warn(`[aiClient:${source}] credit recording failed:`, e);
  }
}
