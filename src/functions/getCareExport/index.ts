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

export async function getCareExport(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const page = await listFormationProfiles(table, {
      limit: 500
    });

    const validProfiles: FunctionFormationProfileEntity[] = [];
    let orphanProfilesExcluded = 0;

    for (const profile of page.items) {
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

    const carePriority =
      String(req?.query?.priority ?? "").trim() || null;

    const careAgeBucket =
      String(req?.query?.ageBucket ?? "").trim() || null;

    const escalationLevel =
      String(req?.query?.escalationLevel ?? "").trim() || null;

    const assignmentState =
      String(req?.query?.assignmentState ?? "").trim() || null;

    const assignmentBucket =
      String(req?.query?.assignmentBucket ?? "").trim() || null;

    const projected = readCareCandidateList({
      profiles: validProfiles.map(toCareProfileInput),
      carePriority,
      careAgeBucket,
      escalationLevel,
      assignmentState,
      assignmentBucket
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
    logFunctionError(
      context,
      "getCareExport",
      err,
      { requestId }
    );

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
