import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  readSixWeekVisitorFollowup
} from "../../services/followups/readSixWeekVisitorFollowups";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getSixWeekVisitorFollowup(
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

    const visitorId = String(req?.params?.visitorId ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: { ok: false, requestId, error: "visitorId is required" }
      };
      return;
    }

    const plan = await readSixWeekVisitorFollowup(
      visitorId,
      req?.query?.asOf
    );

    context.res = plan
      ? {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: { ok: true, requestId, plan }
        }
      : {
          status: 404,
          headers: { "content-type": "application/json; charset=utf-8" },
          body: { ok: false, requestId, error: "Follow-up plan not found" }
        };
  } catch (error: any) {
    logFunctionError(context, "getSixWeekVisitorFollowup", error, {
      requestId,
      visitorId: req?.params?.visitorId ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "SIX_WEEK_FOLLOWUP_READ_FAILED",
        error?.message ?? "Unable to read six-week visitor follow-up",
        requestId
      )
    };
  }
}
