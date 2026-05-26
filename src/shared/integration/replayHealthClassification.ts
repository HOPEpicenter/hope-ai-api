export type ReplayHealthClassification =
  | "healthy"
  | "stable"
  | "degraded"
  | "critical";

export function classifyReplayHealth(
  score?: number | null
): ReplayHealthClassification {
  const value =
    Number(score ?? 0);

  if (value >= 90) {
    return "healthy";
  }

  if (value >= 75) {
    return "stable";
  }

  if (value >= 50) {
    return "degraded";
  }

  return "critical";
}
