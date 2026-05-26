export type ReplayBackpressureClassification =
  | "normal"
  | "elevated"
  | "pressured"
  | "critical";

export function classifyReplayBackpressure(
  queuePressure?: number | null
): ReplayBackpressureClassification {
  const value =
    Number(queuePressure ?? 0);

  if (value >= 0.75) {
    return "critical";
  }

  if (value >= 0.5) {
    return "pressured";
  }

  if (value >= 0.25) {
    return "elevated";
  }

  return "normal";
}
