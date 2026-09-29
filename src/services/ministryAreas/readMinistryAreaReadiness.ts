import type {
  CanonicalMinistryArea
} from "../../domain/ministryAreas/projectMinistryAreas";
import type {
  CareCandidate
} from "../care/careCandidateContracts";
import {
  readCareCandidateList
} from "../care/readCareCandidateList";
import {
  readMinistryAreaOverview,
  type MinistryAreaOverview
} from "./readMinistryAreaOverview";
import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../../functions/_shared/formation";
import { getVisitorById } from "../../functions/_shared/visitorsRepository";
import { isSyntheticVisitorRecord } from "../visitors/isSyntheticVisitorRecord";
import {
  readSixWeekVisitorFollowupQueue,
  type SixWeekFollowupQueue
} from "../followups/readSixWeekVisitorFollowups";

export type MinistryAreaReadinessActionPriority =
  | "urgent"
  | "high"
  | "medium";

export type MinistryAreaReadinessActionKey =
  | "urgent-care"
  | "overdue-followups"
  | "escalated-care"
  | "elevated-care"
  | "stale-care"
  | "due-followups";

export type MinistryAreaReadinessAction = {
  key: MinistryAreaReadinessActionKey;
  priority: MinistryAreaReadinessActionPriority;
  label: string;
  reason: string;
  source: "care" | "six-week-followup";
  sourcePath: string;
  count: number;
};

export type MinistryAreaReadiness = {
  ministryArea: Pick<
    CanonicalMinistryArea,
    "ministryAreaId" | "displayName" | "status" | "leaderStaffId"
  >;
  ownership: {
    staffIds: string[];
    activeStaff: number;
    pendingStaff: number;
    inactiveStaff: number;
  };
  care: {
    totalOwned: number;
    urgent: number;
    elevated: number;
    stale: number;
    escalated: number;
  };
  sixWeekFollowup: {
    totalOwned: number;
    due: number;
    overdue: number;
  };
  attention: {
    total: number;
    urgentCare: number;
    overdueFollowups: number;
  };
  recommendedFirstAction: MinistryAreaReadinessAction | null;
};

export type MinistryAreaReadinessDependencies = {
  readOverview?: (
    ministryAreaId: string
  ) => Promise<MinistryAreaOverview | null>;
  readCareCandidates?: () => Promise<CareCandidate[]>;
  readSixWeekQueue?: () => Promise<SixWeekFollowupQueue>;
};

function buildRecommendedFirstAction(
  ministryAreaId: string,
  signals: Pick<MinistryAreaReadiness, "care" | "sixWeekFollowup">
): MinistryAreaReadinessAction | null {
  const sourcePath =
    `/api/ministry-areas/${encodeURIComponent(ministryAreaId)}/readiness`;

  if (signals.care.urgent > 0) {
    return {
      key: "urgent-care",
      priority: "urgent",
      label: "Review urgent care",
      reason: `${signals.care.urgent} urgent care candidate(s) are owned by Staff linked to this Ministry Area.`,
      source: "care",
      sourcePath,
      count: signals.care.urgent
    };
  }

  if (signals.sixWeekFollowup.overdue > 0) {
    return {
      key: "overdue-followups",
      priority: "urgent",
      label: "Review overdue follow-ups",
      reason: `${signals.sixWeekFollowup.overdue} six-week follow-up(s) owned by Staff linked to this Ministry Area are overdue.`,
      source: "six-week-followup",
      sourcePath,
      count: signals.sixWeekFollowup.overdue
    };
  }

  if (signals.care.escalated > 0) {
    return {
      key: "escalated-care",
      priority: "high",
      label: "Review escalated care",
      reason: `${signals.care.escalated} care candidate(s) owned by Staff linked to this Ministry Area require escalation.`,
      source: "care",
      sourcePath,
      count: signals.care.escalated
    };
  }

  if (signals.care.elevated > 0) {
    return {
      key: "elevated-care",
      priority: "high",
      label: "Review elevated care",
      reason: `${signals.care.elevated} elevated care candidate(s) are owned by Staff linked to this Ministry Area.`,
      source: "care",
      sourcePath,
      count: signals.care.elevated
    };
  }

  if (signals.care.stale > 0) {
    return {
      key: "stale-care",
      priority: "medium",
      label: "Review stale care",
      reason: `${signals.care.stale} stale care candidate(s) are owned by Staff linked to this Ministry Area.`,
      source: "care",
      sourcePath,
      count: signals.care.stale
    };
  }

  if (signals.sixWeekFollowup.due > 0) {
    return {
      key: "due-followups",
      priority: "medium",
      label: "Review due follow-ups",
      reason: `${signals.sixWeekFollowup.due} six-week follow-up(s) owned by Staff linked to this Ministry Area are due.`,
      source: "six-week-followup",
      sourcePath,
      count: signals.sixWeekFollowup.due
    };
  }

  return null;
}

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

async function readCanonicalCareCandidates(): Promise<CareCandidate[]> {
  const table = getFormationProfilesTableClient();
  await ensureTable(table);

  const profiles: FunctionFormationProfileEntity[] = [];
  let cursor: string | undefined;

  do {
    const page = await listFormationProfiles(table, {
      limit: 200,
      cursor
    });
    cursor = page.cursor ?? undefined;

    for (const profile of page.items) {
      const visitorId = String(profile.visitorId ?? "").trim();

      if (!visitorId) {
        continue;
      }

      const visitor = await getVisitorById(visitorId);

      if (!visitor || isSyntheticVisitorRecord(visitor)) {
        continue;
      }

      profiles.push(profile);
    }
  } while (cursor);

  return readCareCandidateList({
    profiles: profiles.map(toCareProfileInput)
  }).items;
}

export async function readMinistryAreaReadiness(
  ministryAreaId: string,
  dependencies: MinistryAreaReadinessDependencies = {}
): Promise<MinistryAreaReadiness | null> {
  const normalizedId = String(ministryAreaId ?? "").trim();

  if (!normalizedId) {
    return null;
  }

  const readOverview =
    dependencies.readOverview ?? readMinistryAreaOverview;
  const overview = await readOverview(normalizedId);

  if (!overview) {
    return null;
  }

  const [careCandidates, sixWeekQueue] = await Promise.all([
    (dependencies.readCareCandidates ?? readCanonicalCareCandidates)(),
    (dependencies.readSixWeekQueue ?? readSixWeekVisitorFollowupQueue)()
  ]);

  const staffIds = overview.roster.map(staff => staff.staffId);
  const staffIdSet = new Set(staffIds);
  const ownedCare = careCandidates.filter(
    candidate =>
      candidate.assignedTo !== null &&
      staffIdSet.has(candidate.assignedTo)
  );
  const ownedFollowups = sixWeekQueue.items.filter(
    item =>
      item.plan.ownerStaffId !== null &&
      staffIdSet.has(item.plan.ownerStaffId)
  );
  const urgentCare = ownedCare.filter(
    candidate => candidate.carePriority === "urgent"
  ).length;
  const overdueFollowups = ownedFollowups.filter(
    item => item.plan.nextTask?.status === "overdue"
  ).length;
  const care = {
    totalOwned: ownedCare.length,
    urgent: urgentCare,
    elevated: ownedCare.filter(
      candidate => candidate.carePriority === "elevated"
    ).length,
    stale: ownedCare.filter(
      candidate => candidate.careAgeBucket === "stale"
    ).length,
    escalated: ownedCare.filter(
      candidate => candidate.escalationLevel === "escalate"
    ).length
  };
  const sixWeekFollowup = {
    totalOwned: ownedFollowups.length,
    due: ownedFollowups.filter(
      item => item.plan.nextTask?.status === "due"
    ).length,
    overdue: overdueFollowups
  };
  const attention = {
    total: urgentCare + overdueFollowups,
    urgentCare,
    overdueFollowups
  };

  return {
    ministryArea: {
      ministryAreaId: overview.ministryArea.ministryAreaId,
      displayName: overview.ministryArea.displayName,
      status: overview.ministryArea.status,
      leaderStaffId: overview.ministryArea.leaderStaffId
    },
    ownership: {
      staffIds,
      activeStaff: overview.staffSummary.active,
      pendingStaff: overview.staffSummary.pending,
      inactiveStaff: overview.staffSummary.inactive
    },
    care,
    sixWeekFollowup,
    attention,
    recommendedFirstAction: buildRecommendedFirstAction(
      normalizedId,
      { care, sixWeekFollowup }
    )
  };
}