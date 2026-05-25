export type ReplayLagSeverity =
  | "none"
  | "low"
  | "medium"
  | "high";

export function classifyReplayLagSeverity(
  lagMs?: number | null
): ReplayLagSeverity {
  const lag =
    Number(lagMs ?? 0);

  if (!Number.isFinite(lag) || lag <= 0) {
    return "none";
  }

  if (lag >= 1000 * 60 * 60 * 24) {
    return "high";
  }

  if (lag >= 1000 * 60 * 60) {
    return "medium";
  }

  return "low";
}
