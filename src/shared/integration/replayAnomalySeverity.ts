export type ReplayAnomalySeverity =
  | "none"
  | "low"
  | "medium"
  | "high";

export function classifyReplayAnomalySeverity(args: {
  failed?: number;
  driftRate?: number;
}) {
  const failed =
    Number(args.failed ?? 0);

  const driftRate =
    Number(args.driftRate ?? 0);

  if (failed <= 0 && driftRate <= 0) {
    return "none";
  }

  if (
    failed >= 10 ||
    driftRate >= 0.5
  ) {
    return "high";
  }

  if (
    failed >= 5 ||
    driftRate >= 0.2
  ) {
    return "medium";
  }

  return "low";
}
