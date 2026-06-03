import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateList } from "../../services/care/readCareCandidateList";
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

export async function getCareExport(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const profiles = await listAllFormationProfiles(table);

    const validProfiles: FunctionFormationProfileEntity[] = [];
    let orphanProfilesExcluded = 0;

    for (const profile of profiles) {
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

    const projected = readCareCandidateList({
      profiles: validProfiles.map(toCareProfileInput),
      carePriority: String(req?.query?.priority ?? "").trim() || null,
      careAgeBucket: String(req?.query?.ageBucket ?? "").trim() || null,
      escalationLevel: String(req?.query?.escalationLevel ?? "").trim() || null,
      assignmentState: String(req?.query?.assignmentState ?? "").trim() || null,
      assignmentBucket: String(req?.query?.assignmentBucket ?? "").trim() || null
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        count: projected.count,
        items: projected.items,
        summary: projected.summary,
        projectionIntegrity: {
          orphanProfilesExcluded
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getCareExport", err, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_CARE_EXPORT_FAILED",
        "Unexpected care export error",
        requestId
      )
    };
  }
}
