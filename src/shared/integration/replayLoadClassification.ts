export type ReplayLoadClassification =
  | "light"
  | "moderate"
  | "heavy"
  | "saturated";

export function classifyReplayLoad(
  throughput?: number | null
): ReplayLoadClassification {
  const value =
    Number(throughput ?? 0);

  if (value >= 1000) {
    return "saturated";
  }

  if (value >= 500) {
    return "heavy";
  }

  if (value >= 100) {
    return "moderate";
  }

  return "light";
}
