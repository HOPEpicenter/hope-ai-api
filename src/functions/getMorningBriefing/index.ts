import { getFeatureFlags } from "../../config/featureFlags";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { readCanonicalActivityIntelligence } from "../../services/intelligence/readCanonicalActivityIntelligence";
import { composeMorningBriefing } from "../../services/intelligence/morningBriefingService";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getMorningBriefing(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  const headers = { "content-type": "application/json; charset=utf-8" };

  const auth = requireApiKeyForFunction(req);
  if (!auth.ok) {
    context.res = {
      status: auth.status,
      headers,
      body: auth.body
    };
    return;
  }

  if (!getFeatureFlags().morningBriefing) {
    context.res = {
      status: 404,
      headers,
      body: {
        ok: false,
        requestId,
        code: "MORNING_BRIEFING_DISABLED",
        error: "Morning briefing is not enabled"
      }
    };
    return;
  }

  try {
    const canonical = await readCanonicalActivityIntelligence();
    const briefing = composeMorningBriefing({
      intelligence: canonical.intelligence
    });

    context.res = {
      status: 200,
      headers,
      body: {
        ok: true,
        requestId,
        briefing,
        projectionIntegrity: canonical.projectionIntegrity
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getMorningBriefing", err, { requestId });

    context.res = {
      status: 503,
      headers,
      body: {
        ...apiErrorBody(
          "MORNING_BRIEFING_UNAVAILABLE",
          "Morning briefing sources are unavailable",
          requestId
        ),
        briefing: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          complete: false,
          sources: {
            careSummary: "unavailable",
            followups: "unavailable",
            activityIntelligence: "unavailable",
            opportunitySignals: "unavailable"
          },
          decision: {
            status: "unavailable",
            firstAction: null,
            actions: []
          }
        }
      }
    };
  }
}