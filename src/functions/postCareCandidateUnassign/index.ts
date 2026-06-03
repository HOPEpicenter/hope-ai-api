import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureTable,
  getFormationProfileByVisitorId,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateByVisitorId } from "../../services/care/readCareCandidateByVisitorId";
import {
  createDefaultFormationProfile,
  upsertFormationProfile
} from "../../storage/formation/formationProfilesRepo";
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

export async function postCareCandidateUnassign(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.log.warn("postCareCandidateUnassign auth rejected");
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postCareCandidateUnassign"
        }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }


    const visitor = await getVisitorById(visitorId);

    if (!visitor) {
      context.res = {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "not found" }
      };
      return;
    }

    const table = getFormationProfilesTableClient();
    await ensureTable(table);

    const existingProfile = await getFormationProfileByVisitorId(
      table,
      visitorId
    );

    const profile = {
      ...(existingProfile ?? createDefaultFormationProfile(visitorId)),
      partitionKey: "VISITOR" as const,
      rowKey: visitorId,
      visitorId,
      assignedTo: null,
      updatedAt: new Date().toISOString()
    };

    await upsertFormationProfile(table, profile as any);

    const page = await listFormationProfiles(table, { limit: 500 });

    const result = readCareCandidateByVisitorId({
      visitorId,
      profiles: page.items.map(toCareProfileInput)
    });

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        found: result.found,
        item: result.item
      }
    };
  } catch (err: any) {
    logFunctionError(context, "postCareCandidateUnassign", err, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "POST_CARE_CANDIDATE_UNASSIGN_FAILED",
        "Unexpected care candidate unassignment error",
        requestId
      )
    };
  }
}


