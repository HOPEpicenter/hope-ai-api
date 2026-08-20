import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  recordSixWeekTaskOutcome
} from "../../services/followups/sixWeekVisitorFollowupCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postSixWeekVisitorFollowupTaskOutcome(
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
        body: {
          ...auth.body,
          authRejectedBy: "postSixWeekVisitorFollowupTaskOutcome"
        }
      };
      return;
    }

    const body = req?.body ?? {};
    const result = await recordSixWeekTaskOutcome({
      visitorId: req?.params?.visitorId,
      weekNumber: Number(req?.params?.weekNumber),
      disposition: body.disposition,
      contactMethod: body.contactMethod,
      outcome: body.outcome,
      notes: body.notes,
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
    logFunctionError(
      context,
      "postSixWeekVisitorFollowupTaskOutcome",
      error,
      {
        requestId,
        visitorId: req?.params?.visitorId ?? null,
        weekNumber: req?.params?.weekNumber ?? null
      }
    );

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_TASK_FAILED",
        "Unable to record six-week follow-up task outcome",
        requestId
      )
    };
  }
}
