// Advisor engine types — pure, no engine calls.

export type Confidence = 'high' | 'medium' | 'low';

export type Recommendation = {
  /** Stable identifier for deduplication and testing. */
  id: string;
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
