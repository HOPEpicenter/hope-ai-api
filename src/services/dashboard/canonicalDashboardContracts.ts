export type CanonicalVisitorDashboardCard = {
  visitorId: string;
  lastActivityAt: string | null;
  lastActivitySummary: string | null;
  followupStatus: "action_needed" | "contact_made" | "resolved" | "unassigned";
  assignedTo: string | null;
  assignedToName: string | null;
  attentionState: "needs_attention" | "clear";
  followupUrgency: "OVERDUE" | "AT_RISK" | "ON_TRACK" | null;
  followupOverdue: boolean;
  riskLevel: string | null;
  riskScore: number | null;
  needsFollowup: boolean | null;
  recommendedAction: string | null;
  priorityBand: "urgent" | "high" | "normal" | "low";
  priorityScore: number;
  priorityReason: string;
};
