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
};

export type MinistryAreaReadinessDependencies = {
  readOverview?: (
    ministryAreaId: string
  ) => Promise<MinistryAreaOverview | null>;
  readCareCandidates?: () => Promise<CareCandidate[]>;
  readSixWeekQueue?: () => Promise<SixWeekFollowupQueue>;
};

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
    care: {
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
    },
    sixWeekFollowup: {
      totalOwned: ownedFollowups.length,
      due: ownedFollowups.filter(
        item => item.plan.nextTask?.status === "due"
      ).length,
      overdue: overdueFollowups
    },
    attention: {
      total: urgentCare + overdueFollowups,
      urgentCare,
      overdueFollowups
    }
  };
}