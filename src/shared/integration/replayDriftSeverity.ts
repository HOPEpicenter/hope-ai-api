export type ReplayDriftSeverity =
  | "none"
  | "low"
  | "medium"
  | "high";

export function classifyReplayDriftSeverity(args: {
  drifted?: boolean;
  driftFieldCount?: number;
  repaired?: boolean;
}): ReplayDriftSeverity {
  if (!args.drifted) {
    return "none";
  }

  const count =
    Number(args.driftFieldCount ?? 0);

  if (count >= 10) {
    return "high";
  }

  if (count >= 5) {
    return "medium";
  }

  return "low";
}
