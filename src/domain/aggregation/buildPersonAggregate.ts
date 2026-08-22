import {
  PERSON_AGGREGATION_SCHEMA_VERSION,
  SNAPSHOT_RAIL_V2_SCHEMA_VERSION,
  ReadinessSignal,
  TimelineEventType,
  type MinistryHealthScore,
  type PersonAggregate,
  type ReadinessSignalItem,
   type SnapshotRailV2,
  type TimelineEvent
} from "./phase4Contracts";

export type PersonAggregateInputs = {
  visitorId: string;
  generatedAt: string;
  integratedTimeline: any[];
  integrationSummary: any;
  engagementRisk: any | null;
  formationProfile: any | null;
  sixWeekPlan: any | null;
};

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function asIso(value: unknown): string | null {
  const normalized = asText(value);
  return normalized || null;
}

function toTimelineEvent(item: any, visitorId: string): TimelineEvent {
  const stream = item?.stream === "formation" ? "formation" : "engagement";
  const type = asText(item?.type) as TimelineEventType;
  const source = item?.source && typeof item.source === "object"
    ? {
        system: asText(item.source.system) || "unknown",
        actorId: asText(item.source.actorId) || null
      }
    : null;

  return {
    eventId: asText(item?.eventId) || asText(item?.rowKey),
    visitorId,
    type,
    stream,
    sourceType: type,
    occurredAt: asText(item?.occurredAt),
    recordedAt: asIso(item?.recordedAt),
    summary: asIso(item?.summary),
    source,
    payload: { metadata: item?.data ?? item?.metadata ?? null }
  } as TimelineEvent;
}

function buildReadiness(input: PersonAggregateInputs): ReadinessSignalItem[] {
  const signals: ReadinessSignalItem[] = [];
  const add = (
    signal: ReadinessSignal,
    priority: "routine" | "elevated" | "urgent",
    reason: string,
    source: "engagement" | "formation" | "six_week_followup"
  ) => signals.push({ signal, priority, reason, source, detectedAt: input.generatedAt });

  const risk = input.engagementRisk;
  const summary = input.integrationSummary ?? {};
  const profile = input.formationProfile ?? {};
  const plan = input.sixWeekPlan;

  if (risk?.riskLevel === "high") {
    add(ReadinessSignal.ENGAGEMENT_RISK_HIGH, "urgent", "Engagement risk is high.", "engagement");
  } else if (risk?.riskLevel === "medium") {
    add(ReadinessSignal.ENGAGEMENT_RISK_MEDIUM, "elevated", "Engagement risk needs review.", "engagement");
  }

  if (summary.needsFollowup === true) {
    add(ReadinessSignal.NEEDS_FOLLOWUP, "elevated", "A follow-up remains open.", "formation");
  }
  if (summary.followupUrgency === "AT_RISK") {
    add(ReadinessSignal.FOLLOWUP_AT_RISK, "elevated", "Follow-up is at risk.", "formation");
  }
  if (summary.followupUrgency === "OVERDUE") {
    add(ReadinessSignal.FOLLOWUP_OVERDUE, "urgent", "Follow-up is overdue.", "formation");
  }
  if (plan?.needsOwner === true) {
    add(ReadinessSignal.FOLLOWUP_NEEDS_OWNER, "urgent", "Six-week plan needs an owner.", "six_week_followup");
  }
  if (plan?.nextTask?.status === "due") {
    add(ReadinessSignal.SIX_WEEK_TASK_DUE, "elevated", "Six-week task is due.", "six_week_followup");
  }
  if (plan?.nextTask?.status === "overdue") {
    add(ReadinessSignal.SIX_WEEK_TASK_OVERDUE, "urgent", "Six-week task is overdue.", "six_week_followup");
  }
  if (asIso(profile.lastPrayerRequestedAt)) {
    add(ReadinessSignal.PRAYER_REQUESTED, "routine", "A prayer request is recorded.", "formation");
  }

  return signals;
}

function buildHealth(
  generatedAt: string,
  signals: ReadinessSignalItem[]
): MinistryHealthScore {
  let score = 100;
  const reasons = signals.map(signal => signal.signal);

  for (const signal of signals) {
    if (signal.priority === "urgent") score -= 60;
    else if (signal.priority === "elevated") score -= 30;
    else score -= 10;
  }

  score = Math.max(0, Math.min(100, score));

  return {
    score,
    band: score >= 75 ? "HEALTHY" : score >= 45 ? "WATCH" : "NEEDS_ATTENTION",
    reasons,
    calculatedAt: generatedAt
  };
}

function buildSnapshot(
  input: PersonAggregateInputs,
  health: MinistryHealthScore
): SnapshotRailV2 {
  const summary = input.integrationSummary ?? {};
  const profile = input.formationProfile ?? {};
  const risk = input.engagementRisk;
  const plan = input.sixWeekPlan;

  return {
    schemaVersion: SNAPSHOT_RAIL_V2_SCHEMA_VERSION,
    visitorId: input.visitorId,
    generatedAt: input.generatedAt,
    formationStage: asIso(profile.stage) as SnapshotRailV2["formationStage"],
    formationStageUpdatedAt: asIso(profile.stageUpdatedAt),
    engagementStatus: risk?.engagement?.engaged === true ? "ENGAGED" : null,
    lastEngagedAt: asIso(summary.lastEngagementAt),
    engagementRiskLevel: risk?.riskLevel ?? null,
    engagementRiskScore: Number.isFinite(risk?.riskScore) ? risk.riskScore : null,
    followupNeeded: typeof summary.needsFollowup === "boolean" ? summary.needsFollowup : null,
    followupResolved: typeof summary.followupResolved === "boolean" ? summary.followupResolved : null,
    followupUrgency: summary.followupUrgency ?? null,
    followupOwnerId: asIso(profile.assignedTo),
    sixWeekPlanStatus: plan?.status ?? null,
    sixWeekNextTaskDueDate: asIso(plan?.nextTask?.dueDate),
    sixWeekNeedsOwner: typeof plan?.needsOwner === "boolean" ? plan.needsOwner : null,
    lastFormationAt: asIso(summary.lastFormationAt),
    lastIntegratedAt: asIso(summary.lastIntegratedAt),
    lastPrayerRequestedAt: asIso(profile.lastPrayerRequestedAt)
  };
}

export function buildPersonAggregate(input: PersonAggregateInputs): PersonAggregate {
  const readiness = buildReadiness(input);
  const ministryHealth = buildHealth(input.generatedAt, readiness);

  return {
    schemaVersion: PERSON_AGGREGATION_SCHEMA_VERSION,
    visitorId: input.visitorId,
    generatedAt: input.generatedAt,
    sources: {
      engagement: Array.isArray(input.integratedTimeline) &&
        input.integratedTimeline.some(item => item?.stream === "engagement"),
      formation: !!input.formationProfile ||
        (Array.isArray(input.integratedTimeline) &&
          input.integratedTimeline.some(item => item?.stream === "formation")),
      sixWeekFollowup: input.sixWeekPlan !== null
    },
    snapshot: buildSnapshot(input, ministryHealth),
    ministryHealth,
    readiness,
    timeline: (input.integratedTimeline ?? []).map(item =>
      toTimelineEvent(item, input.visitorId)
    )
  };
}