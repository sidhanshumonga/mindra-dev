import { ElementStats, AdaptiveState, ExpertiseTier, AdaptationSuggestion } from "./types";

/**
 * Calculates user familiarity based on click counts.
 * Uses an exponential decay function: F = 1 - e^(-n / lambda)
 */
export function calculateFamiliarity(clicks: number, lambda: number = 8): number {
  if (clicks <= 0) return 0;
  return Math.min(0.99, 1 - Math.exp(-clicks / lambda));
}

/**
 * Derives the expertise tier from a familiarity score.
 */
export function determineExpertise(familiarity: number): ExpertiseTier {
  if (familiarity < 0.28) return "novice";
  if (familiarity < 0.58) return "learning";
  if (familiarity < 0.85) return "proficient";
  return "expert";
}

/**
 * Computes friction metric based on hesitation, abandonment, and error rates.
 */
export function calculateFriction(stats: ElementStats): number {
  const { clicks, hovers, abandonments, errors, totalHesitation } = stats;

  // 1. Calculate Hesitation Index (0.0 to 1.0)
  // Normalized hesitation: avg hesitation scaled between 0 and 5000ms
  const avgHesitation = clicks > 0 ? totalHesitation / clicks : 0;
  const hesitationIndex = Math.min(1, Math.max(0, avgHesitation / 5000));

  // 2. Calculate Abandonment Rate (0.0 to 1.0)
  // Ratio of hovered-exits with no click to total hovers
  const abandonmentRate = hovers > 0 ? abandonments / hovers : 0;

  // 3. Calculate Error Rate (0.0 to 1.0)
  // Ratio of errors to activations
  const errorRate = clicks > 0 ? Math.min(1, errors / clicks) : 0;

  // Weighted friction formula
  // α = 0.4 (Hesitation), β = 0.4 (Abandonment), γ = 0.2 (Error)
  const friction = 0.4 * hesitationIndex + 0.4 * abandonmentRate + 0.2 * errorRate;

  return Math.min(0.99, Math.max(0.04, friction));
}

/**
 * Computes confidence: C = (1 - friction) * familiarity
 */
export function calculateConfidence(familiarity: number, friction: number): number {
  return Math.min(0.98, Math.max(0, (1 - friction) * familiarity));
}

/**
 * Suggests an adaptation mode based on familiarity.
 */
export function determineSuggestion(
  elementId: string,
  familiarity: number
): AdaptationSuggestion {
  if (familiarity < 0.28) return "show_tutorial";
  if (familiarity < 0.58) return "inline_details";
  if (familiarity < 0.85) return "show_shortcut";
  return "silent";
}

/**
 * Re-evaluates state for a single element.
 */
export function evaluateElementState(
  elementId: string,
  stats: ElementStats,
  lambda: number = 8
): AdaptiveState {
  const f = calculateFamiliarity(stats.clicks, lambda);
  const fr = calculateFriction(stats);
  const c = calculateConfidence(f, fr);
  const exp = determineExpertise(f);
  const sug = determineSuggestion(elementId, f);

  return {
    elementId,
    familiarity: f,
    friction: fr,
    confidence: c,
    expertise: exp,
    suggestion: sug,
  };
}
