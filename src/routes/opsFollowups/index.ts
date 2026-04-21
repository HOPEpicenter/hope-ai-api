import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import {
  getFormationEventsTableClient,
  getFormationProfilesTableClient,
} from "../../storage/formation/formationTables";
import { ensureTableExists } from "../../shared/storage/ensureTableExists";
import { deriveFollowupPriority } from "../../services/followups/deriveFollowupPriority";
import { deriveEngagementRiskV1 } from "../../domain/engagement/deriveEngagementRisk.v1";
import { computeEngagementScoreV1 } from "../../domain/engagement/computeEngagementScore.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

type FollowupUrgency = "ON_TRACK" | "AT_RISK" | "OVERDUE";
type FollowupAgingBucket = "SAME_DAY" | "ONE_DAY" | "TWO_PLUS_DAYS";

type QueueItem = {
  visitorId: string;
  assignedTo: { ownerType: "user"; ownerId: string } | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
  stage: string | null;
  lastFormationEventType?: string | null;
  lastFormationEventAt?: string | null;
  needsFollowup: boolean;
  followupReason?: string;
  followupResolved: boolean;
  resolvedForAssignment: boolean;
  followupUrgency?: FollowupUrgency;
  followupPriorityScore?: number;
  followupAgingBucket?: FollowupAgingBucket;
  followupEscalated: boolean;
  followupOverdue: boolean;
  engagementRiskLevel?: string | null;
  engagementRiskScore?: number | null;
  priorityBand?: string | null;
  priorityReason?: string | null;
  lastActivityAt?: string | null;
};

type EventState = {
  visitorId: string;
  assignedTo: string | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
};

function hoursBetween(a: string, b: string): number {
  const ams = Date.parse(a);
  const bms = Date.parse(b);
  if (Number.isNaN(ams) || Number.isNaN(bms)) return 0;
  return (bms - ams) / (1000 * 60 * 60);
}

function getEventVisitorId(e: any): string {
  return String(
    e?.visitorId ??
      e?.partitionKey ??
      e?.PartitionKey ??
      ""
  ).trim();
}

function getEventOccurredAt(e: any): string | null {
  const value = String(e?.occurredAt ?? "").trim();
  return value || null;
}

function getEventAssigneeId(e: any): string {
  return String(
    e?.assigneeId ??
      e?.["data_assigneeId"] ??
      e?.data?.assigneeId ??
      e?.metadata?.assigneeId ??
      ""
  ).trim();
}

function compareIsoAsc(a: string | null, b: string | null): number {
  const aa = String(a ?? "");
  const bb = String(b ?? "");
  return aa.localeCompare(bb);
}

function deriveQueueSignals(state: {
  assignedTo: string | null;
  lastFollowupAssignedAt: string | null;
  lastFollowupContactedAt: string | null;
  lastFollowupOutcomeAt: string | null;
}) {
  const assignedAt = state.lastFollowupAssignedAt;
  const contactedAt = state.lastFollowupContactedAt;
  const outcomeAt = state.lastFollowupOutcomeAt;
  const assignedTo = String(state.assignedTo ?? "").trim();

  const followupResolved =
    !!assignedAt &&
    !!outcomeAt &&
    String(outcomeAt) >= String(assignedAt);

  if (!assignedAt) {
    return {
      followupResolved: false,
      resolvedForAssignment: false,
      followupReason: undefined as string | undefined,
      followupUrgency: undefined as FollowupUrgency | undefined,
      followupPriorityScore: undefined as number | undefined,
      followupAgingBucket: undefined as FollowupAgingBucket | undefined,
      followupEscalated: false,
      followupOverdue: false,
      needsFollowup: false,
    };
  }

  if (followupResolved) {
    return {
      followupResolved: true,
      resolvedForAssignment: true,
      followupReason: "FOLLOWUP_OUTCOME_RECORDED",
      followupUrgency: undefined as FollowupUrgency | undefined,
      followupPriorityScore: undefined as number | undefined,
      followupAgingBucket: undefined as FollowupAgingBucket | undefined,
      followupEscalated: false,
      followupOverdue: false,
      needsFollowup: false,
    };
  }

  const ageHours = hoursBetween(String(assignedAt), new Date().toISOString());

  let followupUrgency: FollowupUrgency;
  let followupPriorityScore: number;
  let followupAgingBucket: FollowupAgingBucket;
  let followupEscalated: boolean;
  let followupOverdue: boolean;

  if (ageHours >= 48) {
    followupUrgency = "OVERDUE";
    followupPriorityScore = 90;
    followupAgingBucket = "TWO_PLUS_DAYS";
    followupEscalated = true;
    followupOverdue = true;
  } else if (ageHours >= 24) {
    followupUrgency = "AT_RISK";
    followupPriorityScore = 60;
    followupAgingBucket = "ONE_DAY";
    followupEscalated = false;
    followupOverdue = false;
  } else {
    followupUrgency = "ON_TRACK";
    followupPriorityScore = 25;
    followupAgingBucket = "SAME_DAY";
    followupEscalated = false;
    followupOverdue = false;
  }

  const followupReason = contactedAt
    ? "FOLLOWUP_CONTACTED"
    : assignedTo
      ? "FOLLOWUP_ASSIGNED"
      : "FOLLOWUP_UNASSIGNED";

  return {
    followupResolved: false,
    resolvedForAssignment: false,
    followupReason,
    followupUrgency,
    followupPriorityScore,
    followupAgingBucket,
    followupEscalated,
    followupOverdue,
    needsFollowup: true,
  };
}

function compareQueueItems(a: QueueItem, b: QueueItem): number {
  const resolvedDiff =
    Number(a.followupResolved === true) - Number(b.followupResolved === true);
  if (resolvedDiff !== 0) return resolvedDiff;

  const atA = String(a.lastFollowupAssignedAt ?? "");
  const atB = String(b.lastFollowupAssignedAt ?? "");
  if (atA !== atB) return atB.localeCompare(atA);

  const escalatedDiff =
    Number(b.followupEscalated === true) - Number(a.followupEscalated === true);
  if (escalatedDiff !== 0) return escalatedDiff;

  const riskA = Number((a as any).engagementRiskScore ?? 0);
  const riskB = Number((b as any).engagementRiskScore ?? 0);
  if (riskB !== riskA) return riskB - riskA;

  const scoreA = Number(a.followupPriorityScore ?? 0);
  const scoreB = Number(b.followupPriorityScore ?? 0);
  if (scoreB !== scoreA) return scoreB - scoreA;

  return a.visitorId.localeCompare(b.visitorId);
}

export const opsFollowupsRouter = Router();
opsFollowupsRouter.use(requireApiKey);

opsFollowupsRouter.get("/", async (req, res) => {
  const eventsTable = getFormationEventsTableClient();
  const profilesTable = getFormationProfilesTableClient();
  await ensureTableExists(eventsTable as any);
  await ensureTableExists(profilesTable as any);
  const engagementService = new EngagementsService(new EngagementEventsRepository());

  const limitRaw = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const assignedToFilterRaw = Array.isArray(req.query.assignedTo) ? req.query.assignedTo[0] : req.query.assignedTo;
  const includeResolvedRaw = Array.isArray(req.query.includeResolved) ? req.query.includeResolved[0] : req.query.includeResolved;

  const parsedLimit = Number(limitRaw);
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, 100)
      : 25;

  const assignedToFilter = String(assignedToFilterRaw ?? "").trim();
  const includeResolved =
    String(includeResolvedRaw ?? "").trim().toLowerCase() === "true";

  const stateByVisitor = new Map<string, EventState>();
  const formationProfileByVisitor = new Map<string, { stage: string | null; lastFormationEventType: string | null; lastFormationEventAt: string | null }>();

  for await (const e of eventsTable.listEntities<any>({})) {
    const type = String(e?.type ?? "").trim();
    if (
      type !== "FOLLOWUP_ASSIGNED" &&
      type !== "FOLLOWUP_UNASSIGNED" &&
      type !== "FOLLOWUP_CONTACTED" &&
      type !== "FOLLOWUP_OUTCOME_RECORDED"
    ) {
      continue;
    }

    const visitorId = getEventVisitorId(e);
    if (!visitorId) continue;

    const occurredAt = getEventOccurredAt(e);
    if (!occurredAt) continue;

    let state = stateByVisitor.get(visitorId);
    if (!state) {
      state = {
        visitorId,
        assignedTo: null,
        lastFollowupAssignedAt: null,
        lastFollowupContactedAt: null,
        lastFollowupOutcomeAt: null,
      };
      stateByVisitor.set(visitorId, state);
    }

    if (type === "FOLLOWUP_ASSIGNED") {
      if (compareIsoAsc(state.lastFollowupAssignedAt, occurredAt) <= 0) {
        state.lastFollowupAssignedAt = occurredAt;
        state.assignedTo = getEventAssigneeId(e) || state.assignedTo || null;
      }
      continue;
    }

    if (type === "FOLLOWUP_UNASSIGNED") {
      if (compareIsoAsc(state.lastFollowupAssignedAt, occurredAt) <= 0) {
        state.lastFollowupAssignedAt = occurredAt;
        state.assignedTo = null;
      }
      continue;
    }

    if (type === "FOLLOWUP_CONTACTED") {
      if (compareIsoAsc(state.lastFollowupContactedAt, occurredAt) <= 0) {
        state.lastFollowupContactedAt = occurredAt;
      }
      continue;
    }

    if (type === "FOLLOWUP_OUTCOME_RECORDED") {
      if (compareIsoAsc(state.lastFollowupOutcomeAt, occurredAt) <= 0) {
        state.lastFollowupOutcomeAt = occurredAt;
      }
    }
  }

  for await (const p of profilesTable.listEntities<any>({})) {
    const visitorId = String((p as any)?.rowKey ?? (p as any)?.RowKey ?? "").trim();
    if (!visitorId) continue;

    formationProfileByVisitor.set(visitorId, {
      stage: (p as any)?.stage ?? null,
      lastFormationEventType: (p as any)?.lastEventType ?? null,
      lastFormationEventAt: (p as any)?.lastEventAt ?? null,
    });

    if (!stateByVisitor.has(visitorId)) continue;

    const state = stateByVisitor.get(visitorId)!;
    const profileAssignedTo = String((p as any)?.assignedTo ?? "").trim();
    const profileAssignedAt = String((p as any)?.lastFollowupAssignedAt ?? "").trim() || null;
    const profileContactedAt = String((p as any)?.lastFollowupContactedAt ?? "").trim() || null;
    const profileOutcomeAt = String((p as any)?.lastFollowupOutcomeAt ?? "").trim() || null;

    if (!state.assignedTo && profileAssignedTo) {
      state.assignedTo = profileAssignedTo;
    }
    if (compareIsoAsc(state.lastFollowupAssignedAt, profileAssignedAt) < 0) {
      state.lastFollowupAssignedAt = profileAssignedAt;
    }
    if (compareIsoAsc(state.lastFollowupContactedAt, profileContactedAt) < 0) {
      state.lastFollowupContactedAt = profileContactedAt;
    }
    if (compareIsoAsc(state.lastFollowupOutcomeAt, profileOutcomeAt) < 0) {
      state.lastFollowupOutcomeAt = profileOutcomeAt;
    }
  }

  const items: QueueItem[] = [];

  for (const state of stateByVisitor.values()) {
    const signals = deriveQueueSignals(state);
    if (!includeResolved && signals.followupResolved) continue;
    if (!signals.followupResolved && !signals.needsFollowup) continue;

    const ownerId = String(state.assignedTo ?? "").trim();
    if (assignedToFilter && ownerId !== assignedToFilter) continue;

    let riskLevel: string | null = null;
    let riskScore: number | null = null;
    let priorityBand: string | null = null;
    let priorityReason: string | null = null;

    try {
      
      const MAX_EVENTS = 500;
      const PAGE_SIZE = 100;

      const all: any[] = [];
      let cursor: string | undefined = undefined;

      while (all.length < MAX_EVENTS) {
        const page = await engagementService.readTimeline(state.visitorId, PAGE_SIZE, cursor);
        all.push(...(page.items ?? []));
        if (!page.nextCursor) break;
        cursor = page.nextCursor;
      }

      const score = computeEngagementScoreV1({
        events: all,
        windowDays: 14
      });

      const risk = deriveEngagementRiskV1({
        visitorId: state.visitorId,
        windowDays: 14,
        engaged: score.engaged,
        lastEngagedAt: score.lastEngagedAt,
        daysSinceLastEngagement: score.daysSinceLastEngagement,
        engagementCount: score.engagementCount,
        score: score.score,
        scoreReasons: score.scoreReasons,
        needsFollowup: score.needsFollowup
      });

      const priority = deriveFollowupPriority({
        needsFollowup: signals.needsFollowup,
        riskLevel: risk.riskLevel,
        riskScore: risk.riskScore
      });

      riskLevel = risk.riskLevel;
      riskScore = risk.riskScore;
      priorityBand = priority.priorityBand;
      priorityReason = priority.priorityReason;

      const stage = formationProfileByVisitor.get(state.visitorId)?.stage ?? null;
      if (priorityBand === "normal" && stage === "Guest") {
        if (signals.followupReason === "FOLLOWUP_CONTACTED") {
          priorityReason = "guest_contacted_needs_followup";
        } else if (priorityReason === "needs_followup") {
          priorityReason = "guest_needs_followup";
        }
      }
    } catch {
      // fail safe: queue still returns even if enrichment fails
    }

    items.push({
      visitorId: state.visitorId,
      assignedTo: ownerId
        ? { ownerType: "user", ownerId }
        : null,
      lastFollowupAssignedAt: state.lastFollowupAssignedAt,
      lastFollowupContactedAt: state.lastFollowupContactedAt,
      lastFollowupOutcomeAt: state.lastFollowupOutcomeAt,
      stage: formationProfileByVisitor.get(state.visitorId)?.stage ?? null,
      lastFormationEventType: formationProfileByVisitor.get(state.visitorId)?.lastFormationEventType ?? null,
      lastFormationEventAt: formationProfileByVisitor.get(state.visitorId)?.lastFormationEventAt ?? null,
      needsFollowup: signals.needsFollowup,
      followupReason: signals.followupReason,
      followupResolved: signals.followupResolved,
      resolvedForAssignment: signals.resolvedForAssignment,
      followupUrgency: signals.followupUrgency,
      followupPriorityScore: signals.followupPriorityScore,
      followupAgingBucket: signals.followupAgingBucket,
      followupEscalated: signals.followupEscalated,
      followupOverdue: signals.followupOverdue,
      engagementRiskLevel: riskLevel,
      engagementRiskScore: riskScore,
      priorityBand: priorityBand,
      priorityReason: priorityReason,
      lastActivityAt: [
        state.lastFollowupOutcomeAt,
        state.lastFollowupContactedAt,
        state.lastFollowupAssignedAt
      ].filter(Boolean).sort().pop() ?? null,
    });
  }

  items.sort(compareQueueItems);

  const stats = {
    total: items.length,
    resolved: items.filter((x) => x.followupResolved === true).length,
    escalated: items.filter((x) => x.followupEscalated === true).length,
    overdue: items.filter((x) => x.followupUrgency === "OVERDUE").length,
    atRisk: items.filter((x) => x.followupUrgency === "AT_RISK").length,
    onTrack: items.filter((x) => x.followupUrgency === "ON_TRACK").length,
  };

  const ownersMap = new Map<
    string,
    {
      ownerId: string;
      total: number;
      resolved: number;
      overdue: number;
      atRisk: number;
      onTrack: number;
    }
  >();

  for (const item of items) {
    const ownerId = String(item?.assignedTo?.ownerId ?? "").trim();
    if (!ownerId) continue;

    if (!ownersMap.has(ownerId)) {
      ownersMap.set(ownerId, {
        ownerId,
        total: 0,
        resolved: 0,
        overdue: 0,
        atRisk: 0,
        onTrack: 0,
      });
    }

    const bucket = ownersMap.get(ownerId)!;
    bucket.total++;

    if (item.followupResolved === true) bucket.resolved++;
    else if (item.followupUrgency === "OVERDUE") bucket.overdue++;
    else if (item.followupUrgency === "AT_RISK") bucket.atRisk++;
    else if (item.followupUrgency === "ON_TRACK") bucket.onTrack++;
  }

  const owners = Array.from(ownersMap.values()).sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return a.ownerId.localeCompare(b.ownerId);
  });

  return res.json({
    ok: true,
    v: 1,
    assignedTo: assignedToFilter || null,
    includeResolved,
    stats,
    owners,
    items: items.slice(0, limit),
  });
});
















