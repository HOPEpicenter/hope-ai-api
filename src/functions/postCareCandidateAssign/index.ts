import { randomUUID } from "node:crypto";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  ensureFormationTables,
  recordFormationEventV1,
  type FunctionFormationProfileEntity
} from "../_shared/formation";
import { getVisitorById } from "../_shared/visitorsRepository";
import { readCareCandidateByVisitorId } from "../../services/care/readCareCandidateByVisitorId";
import { resolveMutationSource } from "../../services/events/resolveMutationSource";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import { isKnownStaffId } from "../../services/operators/operatorIdentity";

function toCareProfileInput(profile: FunctionFormationProfileEntity) {
  return {
    visitorId: profile.visitorId,
    assignedTo: profile.assignedTo ?? null,
    lastFollowupOutcome: profile.lastFollowupOutcome ?? null,
    lastFollowupOutcomeAt: profile.lastFollowupOutcomeAt ?? null
  };
}

export async function postCareCandidateAssign(
  context: any,
  req: any
): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.log.warn("postCareCandidateAssign auth rejected");
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postCareCandidateAssign"
        }
      };
      return;
    }

    const visitorId = String(req?.params?.visitorId ?? "").trim();
    const assignedTo = String(req?.body?.assignedTo ?? "").trim();
    const actorId = String(req?.body?.actorId ?? "").trim();
    const eventId = String(req?.body?.eventId ?? "").trim() || randomUUID();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    if (!assignedTo) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "assignedTo is required" }
      };
      return;
    }

    if (!actorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "actorId is required" }
      };
      return;
    }

    if (!isKnownStaffId(actorId)) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "actorId must reference a known staff identity" }
      };
      return;
    }

    if (!isKnownStaffId(assignedTo)) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, error: "assignedTo must reference a known staff identity" }
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

    await ensureFormationTables();

    const eventResult = await recordFormationEventV1({
      v: 1,
      eventId,
      visitorId,
      type: "FOLLOWUP_ASSIGNED",
      occurredAt: new Date().toISOString(),
      source: resolveMutationSource({
        system: "hope-dashboard-next",
        actorId
      }),
      data: {
        assigneeId: assignedTo
      }
    });

    const result = readCareCandidateByVisitorId({
      visitorId,
      profiles: [toCareProfileInput(eventResult.profile)]
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
    logFunctionError(context, "postCareCandidateAssign", err, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "POST_CARE_CANDIDATE_ASSIGN_FAILED",
        "Unexpected care candidate assignment error",
        requestId
      )
    };
  }
}
