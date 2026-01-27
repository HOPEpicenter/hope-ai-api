import { computeEngagementScore } from "./engagementRepository";
import { listStatus } from "./visitorStatusRepository";
import { TableClient } from "@azure/data-tables";

const VISITOR_TABLE = "devVisitors";

function getVisitorClient() {
  return TableClient.fromConnectionString(
    process.env.AzureWebJobsStorage!,
    VISITOR_TABLE
  );
}

export interface PastoralAlert {
  type: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface SuggestedAction {
  code: string;
  label: string;
  reason: string;
  priority: "low" | "medium" | "high";
}

export interface PastoralInsightsResult {
  visitorId: string;
  score: number;
  riskLevel: string;
  lastContactDaysAgo: number | null;
  alerts: PastoralAlert[];
  suggestedActions: SuggestedAction[];
}

export async function getPastoralInsights(visitorId: string): Promise<PastoralInsightsResult> {
  const visitorClient = getVisitorClient();

  const rawVisitor = await visitorClient.getEntity("visitor", visitorId);
  const visitor = rawVisitor as unknown as {
    rowKey: string;
    firstName?: string;
    lastName?: string;
    status?: string;
    createdAt?: string;
    tagsJson?: string;
  };

  const engagement = await computeEngagementScore(visitorId);
  const history = await listStatus(visitorId);

  const tags: string[] = visitor.tagsJson ? JSON.parse(visitor.tagsJson) : [];

  const alerts: PastoralAlert[] = [];
  const suggestedActions: SuggestedAction[] = [];

  const lastContactDaysAgo = engagement.lastContactDaysAgo;

  // Alert: no status history
  if (history.length === 0) {
    alerts.push({
      type: "no-history",
      message: "No status history recorded for this visitor.",
      severity: "warning"
    });

    suggestedActions.push({
      code: "add-initial-status",
      label: "Record first contact or visit",
      reason: "There is no status history yet for this visitor.",
      priority: "medium"
    });
  }

  // Alert: first-time with low engagement
  if (tags.includes("first-time") && engagement.score < 30) {
    alerts.push({
      type: "first-time-low-score",
      message: "First-time visitor with low engagement score.",
      severity: "warning"
    });

    suggestedActions.push({
      code: "follow-up-first-time",
      label: "Send a warm follow-up message",
      reason: "First-time visitor has a low engagement score and may need a personal touch.",
      priority: "high"
    });
  }

  // Alert: at risk by score
  if (engagement.riskLevel === "high") {
    alerts.push({
      type: "high-risk-score",
      message: "Engagement score indicates this visitor is at high risk.",
      severity: "critical"
    });

    suggestedActions.push({
      code: "pastoral-check-in",
      label: "Schedule a pastoral check-in",
      reason: "Engagement score is high risk; a direct pastoral touch may be needed.",
      priority: "high"
    });
  } else if (engagement.riskLevel === "medium") {
    alerts.push({
      type: "medium-risk-score",
      message: "Engagement score indicates this visitor needs attention.",
      severity: "warning"
    });

    suggestedActions.push({
      code: "light-follow-up",
      label: "Send a light follow-up or encouragement",
      reason: "Engagement score is moderate; a gentle touch can strengthen connection.",
      priority: "medium"
    });
  }

  // Alert: time since last contact
  if (lastContactDaysAgo !== null) {
    if (lastContactDaysAgo > 60) {
      alerts.push({
        type: "long-time-no-contact",
        message: "More than 60 days since last recorded contact.",
        severity: "critical"
      });

      suggestedActions.push({
        code: "reconnect-long-gap",
        label: "Reach out after long silence",
        reason: "It has been over 60 days since the last contact.",
        priority: "high"
      });
    } else if (lastContactDaysAgo > 30) {
      alerts.push({
        type: "over-30-days-no-contact",
        message: "More than 30 days since last recorded contact.",
        severity: "warning"
      });

      suggestedActions.push({
        code: "check-in-30-days",
        label: "Check in after a month of silence",
        reason: "It has been over 30 days since the last contact.",
        priority: "medium"
      });
    }
  }

  // Positive suggestion: deepen engagement
  if (engagement.score >= 40 && tags.includes("first-time")) {
    suggestedActions.push({
      code: "invite-next-step",
      label: "Invite to next step (group, class, or team)",
      reason: "Engagement is healthy for a first-time visitor; they may be ready for a next step.",
      priority: "medium"
    });
  }

  return {
    visitorId: visitor.rowKey,
    score: engagement.score,
    riskLevel: engagement.riskLevel,
    lastContactDaysAgo,
    alerts,
    suggestedActions
  };
}
