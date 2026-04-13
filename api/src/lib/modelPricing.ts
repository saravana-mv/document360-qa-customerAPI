// Shared model registry for the Claude-backed generation endpoints.
// Keeps model IDs and USD-per-token prices in one place so cost reporting
// stays accurate as we switch models.

export type ModelId =
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001";

interface ModelInfo {
  /** USD per input token. */
  inputPrice: number;
  /** USD per output token. */
  outputPrice: number;
}

const MODELS: Record<ModelId, ModelInfo> = {
  // Opus 4.6 — $15 / $75 per million
  "claude-opus-4-6":          { inputPrice: 15 / 1_000_000, outputPrice: 75 / 1_000_000 },
  // Sonnet 4.6 — $3 / $15 per million
  "claude-sonnet-4-6":        { inputPrice:  3 / 1_000_000, outputPrice: 15 / 1_000_000 },
  // Haiku 4.5 — $1 / $5 per million
  "claude-haiku-4-5-20251001": { inputPrice: 1 / 1_000_000, outputPrice:  5 / 1_000_000 },
};

/** Default model for flow XML generation — structured output, no deep reasoning needed. */
export const DEFAULT_FLOW_MODEL: ModelId = "claude-sonnet-4-6";
/** Default model for flow-idea brainstorming — creative but cheap enough on Sonnet. */
export const DEFAULT_IDEAS_MODEL: ModelId = "claude-sonnet-4-6";

export function resolveModel(requested: unknown, fallback: ModelId): ModelId {
  if (typeof requested === "string" && requested in MODELS) {
    return requested as ModelId;
  }
  return fallback;
}

export function priceFor(model: ModelId): ModelInfo {
  return MODELS[model];
}

export function computeCost(model: ModelId, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return parseFloat(((inputTokens * p.inputPrice) + (outputTokens * p.outputPrice)).toFixed(6));
}
