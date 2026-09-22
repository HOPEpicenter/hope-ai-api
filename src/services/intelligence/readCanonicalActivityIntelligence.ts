import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../../functions/_shared/formation";
import { getVisitorById } from "../../functions/_shared/visitorsRepository";
import { isSyntheticVisitorRecord } from "../visitors/isSyntheticVisitorRecord";
import { readCareCandidateList } from "../care/readCareCandidateList";
import { readCanonicalOpsFollowupsNarrative } from "../followups/readCanonicalOpsFollowupsNarrative";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";
import {
  buildActivityIntelligence,
  type ActivityIntelligenceResult
} from "./activityIntelligenceService";

export type CanonicalMorningBriefingCareCandidate = {
  visitorId: string;
  displayName: string;
  reason: "needs_care";
  carePriority: "normal" | "elevated" | "urgent";
  assignmentState: "assigned" | "unassigned";
  assignmentBucket: "owned" | "queue";
};

export type CanonicalActivityIntelligenceRead = {
  intelligence: ActivityIntelligenceResult;
  careCandidates: CanonicalMorningBriefingCareCandidate[];
  owners: Awaited<ReturnType<typeof readCanonicalOpsFollowupsNarrative>>["owners"];
  projectionIntegrity: {
    orphanProfilesExcluded: number;
  };
};

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

async function listAllFormationProfiles(
  table: any
): Promise<FunctionFormationProfileEntity[]> {
  const profiles: FunctionFormationProfileEntity[] = [];
  let cursor: string | undefined = undefined;

  do {
    const page = await listFormationProfiles(table, {
      limit: 200,
      cursor
    });

    profiles.push(...page.items);
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return profiles;
}

export async function readCanonicalActivityIntelligence(): Promise<CanonicalActivityIntelligenceRead> {
  const profilesTable = getFormationProfilesTableClient();
  const eventsTable = getFormationEventsTableClient();

  await ensureTable(profilesTable);
  await ensureTable(eventsTable);

  const formationProfiles = await listAllFormationProfiles(profilesTable);
  const validProfiles: FunctionFormationProfileEntity[] = [];
  const visitorNamesById = new Map<string, string>();
  let orphanProfilesExcluded = 0;

  for (const profile of formationProfiles) {
    const visitorId = String(profile.visitorId ?? "").trim();

    if (!visitorId) {
      orphanProfilesExcluded++;
      continue;
    }

    const visitor = await getVisitorById(visitorId);
    if (!visitor || isSyntheticVisitorRecord(visitor)) {
      if (!visitor) orphanProfilesExcluded++;
      continue;
    }

    validProfiles.push(profile);
    visitorNamesById.set(visitorId, visitor.name);
  }

  const care = readCareCandidateList({
    profiles: validProfiles.map(toCareProfileInput)
  });

  const followups = await readCanonicalOpsFollowupsNarrative({
    eventsTable,
    profilesTable,
    limit: 500,
    cursor: 0,
    includeResolved: true,
    includeSynthetic: false
  });

  return {
    intelligence: buildActivityIntelligence({
      careSummary: care.summary,
      followupStats: followups.stats,
      formationProfiles: validProfiles
    }),
    careCandidates: care.items.map((candidate) => ({
      visitorId: candidate.visitorId,
      displayName:
        visitorNamesById.get(candidate.visitorId) ??
        "Unknown person",
      reason: candidate.reason,
      carePriority: candidate.carePriority,
      assignmentState: candidate.assignmentState,
      assignmentBucket: candidate.assignmentBucket
    })),
    owners: followups.owners,
    projectionIntegrity: {
      orphanProfilesExcluded
    }
  };
}