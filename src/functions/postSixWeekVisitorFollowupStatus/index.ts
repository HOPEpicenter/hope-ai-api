import { requireApiKeyForFunction } from "../_shared/apiKey";
import { resolveSixWeekAdministrativeOverride } from "../_shared/adminStaffActor";
import {
  changeSixWeekFollowupStatus
} from "../../services/followups/sixWeekVisitorFollowupCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postSixWeekVisitorFollowupStatus(
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
        body: { ...auth.body, authRejectedBy: "postSixWeekVisitorFollowupStatus" }
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

    const result = await changeSixWeekFollowupStatus({
      visitorId: req?.params?.visitorId,
      action: body.action,
      reason: body.reason,
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
    logFunctionError(context, "postSixWeekVisitorFollowupStatus", error, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_STATUS_FAILED",
        "Unable to change six-week follow-up status",
        requestId
      )
    };
  }
}
