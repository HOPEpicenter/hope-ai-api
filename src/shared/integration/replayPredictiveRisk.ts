export type ReplayPredictiveRisk =
  | "minimal"
  | "elevated"
  | "high"
  | "severe";

export function classifyReplayPredictiveRisk(
  score?: number | null
): ReplayPredictiveRisk {
  const value =
    Number(score ?? 0);

  if (value >= 90) {
    return "minimal";
  }

  if (value >= 75) {
    return "elevated";
  }

  if (value >= 50) {
    return "high";
  }

  return "severe";
}
