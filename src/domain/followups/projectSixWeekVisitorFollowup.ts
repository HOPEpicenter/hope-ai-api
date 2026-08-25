export const SIX_WEEK_FOLLOWUP_SCHEMA_VERSION = 1 as const;

export type SixWeekFollowupEventType =
  | "six_week_followup.plan_started"
  | "six_week_followup.owner_assigned"
  | "six_week_followup.task_completed"
  | "six_week_followup.task_skipped"
  | "six_week_followup.plan_paused"
  | "six_week_followup.plan_resumed"
  | "six_week_followup.plan_cancelled";

export type SixWeekContactMethod =
  | "call"
  | "email"
  | "in_person"
  | "none";

export type SixWeekCareOutcome = "connected" | "closed";

export type SixWeekFollowupEventData = {
  firstVisitDate?: string;
  ownerStaffId?: string | null;
  contactConsent?: boolean;
  preferredContactMethod?: SixWeekContactMethod | null;
  weekNumber?: number;
  contactMethod?: SixWeekContactMethod;
  outcome?: string;
  careOutcome?: SixWeekCareOutcome | null;
  notes?: string | null;
  reason?: string | null;
};

export type SixWeekFollowupEvent = {
  eventId: string;
  visitorId: string;
  type: SixWeekFollowupEventType;
  occurredAt: string;
  actorId: string;
  data: SixWeekFollowupEventData;
};

export type SixWeekTaskStatus =
  | "upcoming"
  | "due"
  | "overdue"
  | "completed"
  | "skipped"
  | "paused"
  | "cancelled";

export type SixWeekPlanStatus =
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type SixWeekTaskDefinition = {
  weekNumber: number;
  dueOffsetDays: number;
  action: string;
};

export const SIX_WEEK_TASK_DEFINITIONS: readonly SixWeekTaskDefinition[] = [
  {
    weekNumber: 1,
    dueOffsetDays: 2,
    action: "Make a personal welcome call or email"
  },
  {
    weekNumber: 2,
    dueOffsetDays: 7,
    action: "Invite the visitor to return"
  },
  {
    weekNumber: 3,
    dueOffsetDays: 14,
    action: "Ask about needs, questions, or prayer"
  },
  {
    weekNumber: 4,
    dueOffsetDays: 21,
    action: "Offer a pastoral, group, or ministry connection"
  },
  {
    weekNumber: 5,
    dueOffsetDays: 28,
    action: "Discuss an appropriate next faithful step"
  },
  {
    weekNumber: 6,
    dueOffsetDays: 35,
    action: "Review the relationship and record the retention outcome"
  }
] as const;

export type SixWeekFollowupTask = {
  weekNumber: number;
  action: string;
  dueDate: string;
  status: SixWeekTaskStatus;
  completedAt: string | null;
  completedBy: string | null;
  contactMethod: SixWeekContactMethod | null;
  outcome: string | null;
  notes: string | null;
};

export type SixWeekVisitorFollowupPlan = {
  schemaVersion: typeof SIX_WEEK_FOLLOWUP_SCHEMA_VERSION;
  planId: string;
  visitorId: string;
  firstVisitDate: string;
  startedAt: string;
  startedBy: string;
  ownerStaffId: string | null;
  contactConsent: true;
  preferredContactMethod: SixWeekContactMethod | null;
  status: SixWeekPlanStatus;
  needsOwner: boolean;
  tasks: SixWeekFollowupTask[];
  nextTask: SixWeekFollowupTask | null;
  completedTaskCount: number;
  remainingTaskCount: number;
  lastEventId: string;
  lastEventAt: string;
  pausedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function pendingStatus(
  dueDate: string,
  asOfDate: string
): SixWeekTaskStatus {
  if (asOfDate > dueDate) return "overdue";
  if (asOfDate === dueDate) return "due";
  return "upcoming";
}

export function projectSixWeekVisitorFollowup(
  events: SixWeekFollowupEvent[],
  asOf = new Date().toISOString()
): SixWeekVisitorFollowupPlan | null {
  const ordered = [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.eventId.localeCompare(b.eventId)
  );

  const started = ordered.find(
    event => event.type === "six_week_followup.plan_started"
  );

  if (!started) return null;

  const visitorId = normalizeText(started.visitorId);
  const firstVisitDate = normalizeText(started.data.firstVisitDate);

  if (!visitorId || !firstVisitDate || started.data.contactConsent !== true) {
    return null;
  }

  let ownerStaffId = normalizeText(started.data.ownerStaffId) || null;
  let status: SixWeekPlanStatus = "active";
  let pausedAt: string | null = null;
  let cancelledAt: string | null = null;
  let cancellationReason: string | null = null;

  const taskEvents = new Map<number, SixWeekFollowupEvent>();

  for (const event of ordered) {
    if (event.type === "six_week_followup.owner_assigned") {
      ownerStaffId = normalizeText(event.data.ownerStaffId) || null;
      continue;
    }

    if (event.type === "six_week_followup.plan_paused") {
      status = "paused";
      pausedAt = event.occurredAt;
      continue;
    }

    if (event.type === "six_week_followup.plan_resumed") {
      status = "active";
      pausedAt = null;
      continue;
    }

    if (event.type === "six_week_followup.plan_cancelled") {
      status = "cancelled";
      cancelledAt = event.occurredAt;
      cancellationReason = normalizeText(event.data.reason) || null;
      continue;
    }

    if (
      event.type === "six_week_followup.task_completed" ||
      event.type === "six_week_followup.task_skipped"
    ) {
      const weekNumber = Number(event.data.weekNumber);

      if (
        Number.isInteger(weekNumber) &&
        weekNumber >= 1 &&
        weekNumber <= 6
      ) {
        taskEvents.set(weekNumber, event);
      }
    }
  }

  const asOfDate = dateOnly(asOf);

  const tasks = SIX_WEEK_TASK_DEFINITIONS.map(definition => {
    const disposition = taskEvents.get(definition.weekNumber);
    const dueDate = addDays(firstVisitDate, definition.dueOffsetDays);
    let taskStatus: SixWeekTaskStatus;

    if (disposition?.type === "six_week_followup.task_completed") {
      taskStatus = "completed";
    } else if (disposition?.type === "six_week_followup.task_skipped") {
      taskStatus = "skipped";
    } else if (status === "cancelled") {
      taskStatus = "cancelled";
    } else if (status === "paused") {
      taskStatus = "paused";
    } else {
      taskStatus = pendingStatus(dueDate, asOfDate);
    }

    return {
      weekNumber: definition.weekNumber,
      action: definition.action,
      dueDate,
      status: taskStatus,
      completedAt: disposition?.occurredAt ?? null,
      completedBy: disposition?.actorId ?? null,
      contactMethod: disposition?.data.contactMethod ?? null,
      outcome: normalizeText(disposition?.data.outcome) || null,
      notes: normalizeText(disposition?.data.notes) || null
    };
  });

  const completedTaskCount = tasks.filter(task =>
    task.status === "completed" || task.status === "skipped"
  ).length;

  if (status === "active" && completedTaskCount === tasks.length) {
    status = "completed";
  }

  const nextTask =
    status === "active" || status === "paused"
      ? tasks.find(task =>
          task.status !== "completed" && task.status !== "skipped"
        ) ?? null
      : null;

  const lastEvent = ordered[ordered.length - 1];

  return {
    schemaVersion: SIX_WEEK_FOLLOWUP_SCHEMA_VERSION,
    planId: `six-week-followup:${visitorId}`,
    visitorId,
    firstVisitDate,
    startedAt: started.occurredAt,
    startedBy: started.actorId,
    ownerStaffId,
    contactConsent: true,
    preferredContactMethod:
      started.data.preferredContactMethod ?? null,
    status,
    needsOwner: !ownerStaffId,
    tasks,
    nextTask,
    completedTaskCount,
    remainingTaskCount: tasks.length - completedTaskCount,
    lastEventId: lastEvent.eventId,
    lastEventAt: lastEvent.occurredAt,
    pausedAt,
    cancelledAt,
    cancellationReason
  };
}

export function projectSixWeekVisitorFollowups(
  events: SixWeekFollowupEvent[],
  asOf = new Date().toISOString()
): SixWeekVisitorFollowupPlan[] {
  const grouped = new Map<string, SixWeekFollowupEvent[]>();

  for (const event of events) {
    const visitorId = normalizeText(event.visitorId);
    if (!visitorId) continue;
    const current = grouped.get(visitorId) ?? [];
    current.push(event);
    grouped.set(visitorId, current);
  }

  return [...grouped.values()]
    .map(stream => projectSixWeekVisitorFollowup(stream, asOf))
    .filter(
      (plan): plan is SixWeekVisitorFollowupPlan => plan !== null
    )
    .sort((a, b) => {
      if (a.needsOwner !== b.needsOwner) {
        return a.needsOwner ? -1 : 1;
      }

      const aDue = a.nextTask?.dueDate ?? "9999-12-31";
      const bDue = b.nextTask?.dueDate ?? "9999-12-31";

      return aDue.localeCompare(bDue) ||
        a.visitorId.localeCompare(b.visitorId);
    });
}
