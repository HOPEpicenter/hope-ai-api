export type FollowupPriorityBand = "urgent" | "high" | "normal" | "low";

export type FollowupPriority = {
  priorityBand: FollowupPriorityBand;
  priorityScore: number;
  priorityReason: string;
};

export function deriveFollowupPriority(args: {
  needsFollowup: boolean | null | undefined;
  riskLevel: string | null | undefined;
  riskScore: number | null | undefined;
}): FollowupPriority {
  const needsFollowup = args.needsFollowup === true;
  const riskLevel = String(args.riskLevel ?? "").toLowerCase();
  const riskScore = Number(args.riskScore ?? 0);

  if (needsFollowup && riskLevel === "high") {
    return {
      priorityBand: "urgent",
      priorityScore: 100,
      priorityReason: "high_risk_needs_followup"
    };
  }

  if (riskLevel === "high") {
    return {
      priorityBand: "high",
      priorityScore: Math.max(80, riskScore),
      priorityReason: "high_risk"
    };
  }

  if (needsFollowup || riskLevel === "medium") {
    return {
      priorityBand: "normal",
      priorityScore: Math.max(50, riskScore),
      priorityReason: needsFollowup ? "needs_followup" : "medium_risk"
    };
  }

  return {
    priorityBand: "low",
    priorityScore: Math.min(25, riskScore),
    priorityReason: "low_risk"
  };
}
