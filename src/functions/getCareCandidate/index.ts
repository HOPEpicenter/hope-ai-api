import {
  ensureTable,
  getFormationProfilesTableClient,
  listFormationProfiles,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateByVisitorId } from "../../services/care/readCareCandidateByVisitorId";
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

export async function getCareCandidate(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
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

    const profiles = await listAllFormationProfiles(table);

    const result = readCareCandidateByVisitorId({
      visitorId,
      profiles: profiles.map(toCareProfileInput)
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
    logFunctionError(context, "getCareCandidate", err, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_CARE_CANDIDATE_FAILED",
        "Unexpected care candidate error",
        requestId
      )
    };
  }
}
