import {
  DEFAULT_FLOW_MODEL,
  DEFAULT_IDEAS_MODEL,
  resolveModel,
  priceFor,
  computeCost,
} from "../lib/modelPricing";

describe("modelPricing", () => {
  // --- Defaults ---
  test("DEFAULT_FLOW_MODEL is claude-sonnet-4-6", () => {
    expect(DEFAULT_FLOW_MODEL).toBe("claude-sonnet-4-6");
  });

  test("DEFAULT_IDEAS_MODEL is claude-sonnet-4-6", () => {
    expect(DEFAULT_IDEAS_MODEL).toBe("claude-sonnet-4-6");
  });

  // --- resolveModel ---
  describe("resolveModel", () => {
    test("returns requested model when it is a valid ModelId", () => {
      expect(resolveModel("claude-opus-4-6", "claude-sonnet-4-6")).toBe("claude-opus-4-6");
      expect(resolveModel("claude-sonnet-4-6", "claude-opus-4-6")).toBe("claude-sonnet-4-6");
      expect(resolveModel("claude-haiku-4-5-20251001", "claude-sonnet-4-6")).toBe("claude-haiku-4-5-20251001");
    });

    test("returns fallback when requested is an invalid string", () => {
      expect(resolveModel("gpt-4", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
      expect(resolveModel("", "claude-opus-4-6")).toBe("claude-opus-4-6");
      expect(resolveModel("claude-sonnet-3.5", "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    });

    test("returns fallback when requested is undefined, null, or number", () => {
      expect(resolveModel(undefined, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
      expect(resolveModel(null, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
      expect(resolveModel(42, "claude-sonnet-4-6")).toBe("claude-sonnet-4-6");
    });
  });

  // --- priceFor ---
  describe("priceFor", () => {
    test("returns correct prices for Opus ($15/$75 per million)", () => {
      const p = priceFor("claude-opus-4-6");
      expect(p.inputPrice).toBeCloseTo(15 / 1_000_000, 10);
      expect(p.outputPrice).toBeCloseTo(75 / 1_000_000, 10);
    });

    test("returns correct prices for Sonnet ($3/$15 per million)", () => {
      const p = priceFor("claude-sonnet-4-6");
      expect(p.inputPrice).toBeCloseTo(3 / 1_000_000, 10);
      expect(p.outputPrice).toBeCloseTo(15 / 1_000_000, 10);
    });

    test("returns correct prices for Haiku ($1/$5 per million)", () => {
      const p = priceFor("claude-haiku-4-5-20251001");
      expect(p.inputPrice).toBeCloseTo(1 / 1_000_000, 10);
      expect(p.outputPrice).toBeCloseTo(5 / 1_000_000, 10);
    });
  });

  // --- computeCost ---
  describe("computeCost", () => {
    test("calculates correctly for known inputs", () => {
      // Sonnet: 1000 input tokens @ $3/M + 500 output tokens @ $15/M
      // = 0.003 + 0.0075 = 0.0105
      expect(computeCost("claude-sonnet-4-6", 1000, 500)).toBe(0.0105);

      // Opus: 10000 input @ $15/M + 2000 output @ $75/M
      // = 0.15 + 0.15 = 0.3
      expect(computeCost("claude-opus-4-6", 10000, 2000)).toBe(0.3);

      // Haiku: 5000 input @ $1/M + 1000 output @ $5/M
      // = 0.005 + 0.005 = 0.01
      expect(computeCost("claude-haiku-4-5-20251001", 5000, 1000)).toBe(0.01);
    });

    test("returns 0 for zero tokens", () => {
      expect(computeCost("claude-sonnet-4-6", 0, 0)).toBe(0);
      expect(computeCost("claude-opus-4-6", 0, 0)).toBe(0);
      expect(computeCost("claude-haiku-4-5-20251001", 0, 0)).toBe(0);
    });
  });
});
