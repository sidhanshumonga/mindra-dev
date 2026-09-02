import { describe, it, expect } from "vitest";
import {
  calculateFamiliarity,
  calculateFriction,
  calculateConfidence,
  determineExpertise,
  determineSuggestion,
  evaluateElementState,
} from "../src/scoring";
import type { ElementStats } from "../src/types";

const stats = (over: Partial<ElementStats> = {}): ElementStats => ({
  clicks: 0,
  hovers: 0,
  abandonments: 0,
  errors: 0,
  totalHesitation: 0,
  ...over,
});

describe("familiarity", () => {
  it("is zero before any interaction", () => {
    expect(calculateFamiliarity(0)).toBe(0);
    expect(calculateFamiliarity(-3)).toBe(0);
  });

  it("rises asymptotically and never reaches 1", () => {
    expect(calculateFamiliarity(8)).toBeCloseTo(0.632, 2);
    expect(calculateFamiliarity(24)).toBeGreaterThan(0.94);
    expect(calculateFamiliarity(10_000)).toBeLessThan(1);
  });

  it("is monotonic in interaction count", () => {
    const series = [0, 1, 2, 5, 10, 40].map((n) => calculateFamiliarity(n));
    const sorted = [...series].sort((a, b) => a - b);
    expect(series).toEqual(sorted);
  });

  it("slows the curve when lambda is raised", () => {
    expect(calculateFamiliarity(8, 24)).toBeLessThan(calculateFamiliarity(8, 8));
  });
});

describe("expertise tiers", () => {
  it.each([
    [0, "novice"],
    [3, "learning"],
    [9, "proficient"],
    [30, "expert"],
  ])("%i clicks reads as %s", (clicks, tier) => {
    expect(determineExpertise(calculateFamiliarity(clicks as number))).toBe(tier);
  });

  it("pairs each tier with a decreasing level of hand-holding", () => {
    expect(determineSuggestion("x", 0)).toBe("show_tutorial");
    expect(determineSuggestion("x", 0.4)).toBe("inline_details");
    expect(determineSuggestion("x", 0.7)).toBe("show_shortcut");
    expect(determineSuggestion("x", 0.95)).toBe("silent");
  });
});

describe("friction", () => {
  it("stays inside [0.04, 0.99] even under absurd input", () => {
    const wild = calculateFriction(stats({ clicks: 1, hovers: 1, abandonments: 99, errors: 99, totalHesitation: 1e9 }));
    expect(wild).toBeLessThanOrEqual(0.99);
    expect(calculateFriction(stats())).toBeGreaterThanOrEqual(0.04);
  });

  it("rises with abandonment", () => {
    const calm = calculateFriction(stats({ clicks: 10, hovers: 10, abandonments: 0 }));
    const jumpy = calculateFriction(stats({ clicks: 10, hovers: 10, abandonments: 8 }));
    expect(jumpy).toBeGreaterThan(calm);
  });

  it("rises with hesitation", () => {
    const quick = calculateFriction(stats({ clicks: 10, hovers: 10, totalHesitation: 1_000 }));
    const slow = calculateFriction(stats({ clicks: 10, hovers: 10, totalHesitation: 40_000 }));
    expect(slow).toBeGreaterThan(quick);
  });

  it("does not divide by zero on an untouched element", () => {
    expect(Number.isFinite(calculateFriction(stats()))).toBe(true);
  });
});

describe("confidence", () => {
  it("requires both familiarity and low friction", () => {
    expect(calculateConfidence(0, 0)).toBe(0);
    expect(calculateConfidence(0.9, 0.9)).toBeLessThan(calculateConfidence(0.9, 0.1));
  });
});

describe("evaluateElementState", () => {
  it("describes a brand new element as a guided novice", () => {
    const s = evaluateElementState("btn", stats());
    expect(s).toMatchObject({ elementId: "btn", familiarity: 0, expertise: "novice", suggestion: "show_tutorial" });
  });

  it("describes a well-worn element as a silent expert", () => {
    const s = evaluateElementState("btn", stats({ clicks: 40, hovers: 40 }));
    expect(s.expertise).toBe("expert");
    expect(s.suggestion).toBe("silent");
  });
});
