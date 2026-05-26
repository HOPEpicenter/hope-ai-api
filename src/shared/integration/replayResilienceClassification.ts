export type ReplayResilienceClassification =
  | "resilient"
  | "recoverable"
  | "fragile"
  | "unstable";

export function classifyReplayResilience(
  score?: number | null
): ReplayResilienceClassification {
  const value =
    Number(score ?? 0);

  if (value >= 90) {
    return "resilient";
  }

  if (value >= 75) {
    return "recoverable";
  }

  if (value >= 50) {
    return "fragile";
  }

  return "unstable";
}
