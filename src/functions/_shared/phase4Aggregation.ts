import { requireApiKeyForFunction } from "./apiKey";
import {
  Phase4AggregationDisabledError,
  readPhase4Aggregate
} from "../../services/aggregation/readPhase4Aggregate";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function handlePhase4AggregationRead(
  context: any,
  req: any,
  select: (aggregate: any) => Record<string, unknown>
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

    const visitorId = String(req?.params?.id ?? req?.query?.visitorId ?? "").trim();
    if (!visitorId) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: apiErrorBody("VALIDATION_ERROR", "visitorId is required", requestId)
      };
      return;
    }

    const aggregate = await readPhase4Aggregate(visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, ...select(aggregate) }
    };
  } catch (error: any) {
    if (error instanceof Phase4AggregationDisabledError) {
      context.res = {
        status: 503,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: apiErrorBody(error.code, error.message, requestId)
      };
      return;
    }

    logFunctionError(context, "phase4AggregationRead", error, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "PHASE4_AGGREGATION_READ_FAILED",
        error?.message ?? "Unable to read Phase 4 aggregation",
        requestId
      )
    };
  }
}