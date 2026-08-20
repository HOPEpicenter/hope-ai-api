import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  readSixWeekVisitorFollowupQueue
} from "../../services/followups/readSixWeekVisitorFollowups";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getSixWeekVisitorFollowupQueue(
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
        body: auth.body
      };
      return;
    }

    const queue = await readSixWeekVisitorFollowupQueue(req?.query?.asOf);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, requestId, ...queue }
    };
  } catch (error: any) {
    logFunctionError(context, "getSixWeekVisitorFollowupQueue", error, {
      requestId
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_QUEUE_FAILED",
        error?.message ?? "Unable to read six-week follow-up queue",
        requestId
      )
    };
  }
}
