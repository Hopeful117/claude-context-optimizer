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

/**
 * Structured evidence for a recommendation.
 * Values derive directly from the metrics that triggered the rule —
 * no invented or interpolated data.
 */
export type RecommendationEvidence = {
  /** Name of the metric being measured (e.g. 'contextPercent', 'cacheReadRatio'). */
  metric: string;
  /** The measured value that crossed or compared to the threshold. */
  observedValue: number;
  /** The threshold the observed value was compared to, when applicable. */
  threshold?: number;
  /** Number of data points (entries or turns) used for this reading. */
  sampleCount?: number;
};

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
  /** Structured evidence that produced this recommendation. Optional; present on all rule-generated recommendations. */
  evidence?: readonly RecommendationEvidence[];
};

export type AdvisoryResult = {
  /** Recommendations sorted by confidence (high → medium → low). */
  readonly recommendations: readonly Recommendation[];
};
