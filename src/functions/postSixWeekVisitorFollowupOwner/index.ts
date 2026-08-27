import { requireApiKeyForFunction } from "../_shared/apiKey";
import { resolveSixWeekAdministrativeOverride } from "../_shared/adminStaffActor";
import {
  assignSixWeekFollowupOwner
} from "../../services/followups/sixWeekVisitorFollowupCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postSixWeekVisitorFollowupOwner(
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
        body: { ...auth.body, authRejectedBy: "postSixWeekVisitorFollowupOwner" }
      };
      return;
    }

    const body = req?.body ?? {};
    const administrativeOverride =
      await resolveSixWeekAdministrativeOverride(req);

    if (!administrativeOverride.ok) {
      context.res = {
        status: administrativeOverride.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: administrativeOverride.body
      };
      return;
    }

    const result = await assignSixWeekFollowupOwner({
      visitorId: req?.params?.visitorId,
      ownerStaffId: body.ownerStaffId,
      actorId: administrativeOverride.actorId ?? body.actorId,
      administrativeOverrideVerified:
        administrativeOverride.administrativeOverrideVerified
    });

    context.res = {
      status: result.status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: result.accepted
        ? { ok: true, requestId, ...result }
        : { ok: false, requestId, error: result.error }
    };
  } catch (error: any) {
    logFunctionError(context, "postSixWeekVisitorFollowupOwner", error, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_OWNER_FAILED",
        "Unable to assign six-week follow-up owner",
        requestId
      )
    };
  }
}
