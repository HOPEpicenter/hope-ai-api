import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  startSixWeekVisitorFollowup
} from "../../services/followups/sixWeekVisitorFollowupCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postSixWeekVisitorFollowup(
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
        body: { ...auth.body, authRejectedBy: "postSixWeekVisitorFollowup" }
      };
      return;
    }

    const body = req?.body ?? {};
    const result = await startSixWeekVisitorFollowup({
      visitorId: req?.params?.visitorId,
      firstVisitDate: body.firstVisitDate,
      ownerStaffId: body.ownerStaffId,
      contactConsent: body.contactConsent,
      preferredContactMethod: body.preferredContactMethod,
      actorId: body.actorId
    });

    context.res = {
      status: result.status,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: result.accepted
        ? { ok: true, requestId, ...result }
        : { ok: false, requestId, error: result.error }
    };
  } catch (error: any) {
    logFunctionError(context, "postSixWeekVisitorFollowup", error, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_START_FAILED",
        "Unable to start six-week visitor follow-up",
        requestId
      )
    };
  }
}
