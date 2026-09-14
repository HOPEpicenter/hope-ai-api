import type { SixWeekVisitorFollowupPlan } from "../../domain/followups/projectSixWeekVisitorFollowup";

export type SixWeekRetentionSummary = {
  asOf: string;
  planCount: number;
  active: number;
  paused: number;
  completed: number;
  cancelled: number;
  needsOwner: number;
  due: number;
  overdue: number;
  week6Connected: number;
  week6Closed: number;
  week6PendingOutcome: number;
};

export function deriveSixWeekRetentionSummary(
  plans: readonly SixWeekVisitorFollowupPlan[],
  asOf: string
): SixWeekRetentionSummary {
  const count = (predicate: (plan: SixWeekVisitorFollowupPlan) => boolean) =>
    plans.filter(predicate).length;

  return {
    asOf,
    planCount: plans.length,
    active: count(plan => plan.status === "active"),
    paused: count(plan => plan.status === "paused"),
    completed: count(plan => plan.status === "completed"),
    cancelled: count(plan => plan.status === "cancelled"),
    needsOwner: count(plan => plan.needsOwner),
    due: count(plan => plan.nextTask?.status === "due"),
    overdue: count(plan => plan.nextTask?.status === "overdue"),
    week6Connected: count(plan => plan.tasks[5]?.careOutcome === "connected"),
    week6Closed: count(plan => plan.tasks[5]?.careOutcome === "closed"),
    week6PendingOutcome: count(plan =>
      plan.tasks[5]?.status === "completed" &&
      plan.tasks[5]?.contactMethod !== "none" &&
      plan.tasks[5]?.careOutcome === null
    )
  };
}
