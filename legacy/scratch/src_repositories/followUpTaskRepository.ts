import { getPastoralInsights } from "./pastoralInsightsRepository";

export interface FollowUpTask {
  code: string;
  label: string;
  reason: string;
  priority: "low" | "medium" | "high";
  suggestedChannel: "call" | "text" | "email" | "in-person" | "unspecified";
}

export interface FollowUpTaskResult {
  visitorId: string;
  score: number;
  riskLevel: string;
  lastContactDaysAgo: number | null;
  tasks: FollowUpTask[];
}

export async function getFollowUpTasks(visitorId: string): Promise<FollowUpTaskResult> {
  const insights = await getPastoralInsights(visitorId);

  const tasks: FollowUpTask[] = insights.suggestedActions.map(action => {
    let suggestedChannel: FollowUpTask["suggestedChannel"] = "unspecified";

    if (action.code === "light-follow-up") {
      suggestedChannel = "text";
    } else if (action.code === "pastoral-check-in") {
      suggestedChannel = "call";
    } else if (action.code === "follow-up-first-time") {
      suggestedChannel = "text";
    } else if (action.code === "reconnect-long-gap") {
      suggestedChannel = "call";
    } else if (action.code === "check-in-30-days") {
      suggestedChannel = "text";
    } else if (action.code === "invite-next-step") {
      suggestedChannel = "in-person";
    }

    return {
      code: action.code,
      label: action.label,
      reason: action.reason,
      priority: action.priority,
      suggestedChannel
    };
  });

  return {
    visitorId: insights.visitorId,
    score: insights.score,
    riskLevel: insights.riskLevel,
    lastContactDaysAgo: insights.lastContactDaysAgo,
    tasks
  };
}
