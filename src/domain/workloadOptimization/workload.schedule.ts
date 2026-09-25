import type { PastoralWorkloadAssignment } from "./workload.assignment";

export type PastoralWorkloadSchedule = PastoralWorkloadAssignment & {
  action: "personal contact" | "pastoral follow-up" | "planned check-in" | "monitor";
  timeWindow: "today" | "within 48 hours" | "this week" | "this month" | "unassigned";
  horizon: "immediate" | "short-term" | "weekly" | "monthly" | "unassigned";
};

const SCHEDULE_BY_PRIORITY = {
  urgent: { action: "personal contact", timeWindow: "today", horizon: "immediate" },
  high: { action: "pastoral follow-up", timeWindow: "within 48 hours", horizon: "short-term" },
  medium: { action: "planned check-in", timeWindow: "this week", horizon: "weekly" },
  low: { action: "monitor", timeWindow: "this month", horizon: "monthly" }
} as const;

/** Applies the fixed pastoral action, time-window, and planning-horizon rules. */
export function schedulePastoralWorkload(assignments: readonly PastoralWorkloadAssignment[]): PastoralWorkloadSchedule[] {
  return assignments.map((assignment) => {
    if (assignment.status === "unassigned") {
      return { ...assignment, action: "monitor", timeWindow: "unassigned", horizon: "unassigned" };
    }
    return { ...assignment, ...SCHEDULE_BY_PRIORITY[assignment.priority] };
  });
}