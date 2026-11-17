// Advisor engine types — pure, no engine calls.

export type Confidence = 'high' | 'medium' | 'low';

/**
 * Semantic category for a recommendation:
 * - 'observation': informational; no action required
 * - 'warning': something worth watching; consider acting
 * - 'action': a specific action is suggested
 *
 * Confidence reflects data quality and reasoning strength.
 * Category reflects what the user is expected to do with the information.
 * The two are orthogonal.
 */
export type Category = 'observation' | 'warning' | 'action';

export type Recommendation = {
  /** Stable identifier for deduplication and testing. */
  id: string;
  /** Semantic type: observation, warning, or action. */
  category: Category;
  /** Short label shown in the pane. */
  label: string;
  /** One-sentence explanation of why this recommendation was raised. */
  explanation: string;
  confidence: Confidence;
};

export type AdvisoryResult = {
  /** Recommendations sorted by confidence (high → medium → low). */
  readonly recommendations: readonly Recommendation[];
};
