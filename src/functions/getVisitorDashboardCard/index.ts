import { requireApiKeyForFunction } from "../_shared/apiKey";
import { readCanonicalVisitorDashboardCard } from "../../services/dashboard/readCanonicalVisitorDashboardCard";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getVisitorDashboardCard(context: any, req: any): Promise<void> {
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

    const visitorId = String(req?.params?.id ?? "").trim();

    if (!visitorId) {
      context.res = {
        status: 400,
        body: { ok: false, error: "visitorId is required" }
      };
      return;
    }

    const card = await readCanonicalVisitorDashboardCard(visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        visitorId,
        card
      }
    };

  } catch (err: any) {
    logFunctionError(context, "getVisitorDashboardCard", err, {
      requestId,
      visitorId: req?.params?.id ?? null
    });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "VISITOR_DASHBOARD_CARD_FAILED",
        "Unexpected visitor dashboard card error",
        requestId
      )
    };
  }
}
