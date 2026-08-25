import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  confirmHistoricalSixWeekCareOutcome
} from "../../services/followups/sixWeekVisitorFollowupCommands";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function postSixWeekVisitorFollowupHistoricalCareOutcome(
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
          authRejectedBy: "postSixWeekVisitorFollowupHistoricalCareOutcome"
        }
      };
      return;
    }

    const body = req?.body ?? {};
    const result = await confirmHistoricalSixWeekCareOutcome({
      visitorId: req?.params?.visitorId,
      weekNumber: Number(req?.params?.weekNumber),
      careOutcome: body.careOutcome,
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
      "postSixWeekVisitorFollowupHistoricalCareOutcome",
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
        "SIX_WEEK_HISTORICAL_CARE_OUTCOME_FAILED",
        "Unable to confirm the historical six-week care outcome",
        requestId
      )
    };
  }
}
