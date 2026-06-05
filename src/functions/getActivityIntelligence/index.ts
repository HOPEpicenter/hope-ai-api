import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateList } from "../../services/care/readCareCandidateList";
import { readCanonicalOpsFollowupsNarrative } from "../../services/followups/readCanonicalOpsFollowupsNarrative";
import { buildActivityIntelligence } from "../../services/intelligence/activityIntelligenceService";
import { getFormationEventsTableClient } from "../../storage/formation/formationTables";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

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

export async function getActivityIntelligence(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: auth.body
      };
      return;
    }

    const profilesTable = getFormationProfilesTableClient();
    const eventsTable = getFormationEventsTableClient();

    await ensureTable(profilesTable);
    await ensureTable(eventsTable);

    const formationProfiles = await listAllFormationProfiles(profilesTable);

    const validProfiles: FunctionFormationProfileEntity[] = [];
    let orphanProfilesExcluded = 0;

    for (const profile of formationProfiles) {
      const visitorId = String(profile.visitorId ?? "").trim();

      if (!visitorId) {
        orphanProfilesExcluded++;
        continue;
      }

      const visitor = await getVisitorById(visitorId);
      if (!visitor) {
        orphanProfilesExcluded++;
        continue;
      }

      validProfiles.push(profile);
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

    const intelligence = buildActivityIntelligence({
      careSummary: care.summary,
      followupStats: followups.stats,
      formationProfiles: validProfiles
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        ...intelligence,
        followups: {
          ...intelligence.followups,
          owners: followups.owners
        },
        projectionIntegrity: {
          orphanProfilesExcluded
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getActivityIntelligence", err, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_ACTIVITY_INTELLIGENCE_FAILED",
        "Unexpected activity intelligence error",
        requestId
      )
    };
  }
}
