import { requireApiKeyForFunction } from "../_shared/apiKey";
import { getFeatureFlags } from "../../config/featureFlags";
import { getVisitorById } from "../_shared/visitorsRepository";
import { isSyntheticVisitorRecord } from "../../services/visitors/isSyntheticVisitorRecord";
import { SixWeekFollowupEventsRepository } from "../../repositories/sixWeekFollowupEventsRepository";
import { projectSixWeekVisitorFollowups } from "../../domain/followups/projectSixWeekVisitorFollowup";
import { deriveSixWeekRetentionSummary } from "../../services/followups/deriveSixWeekRetentionSummary";
import { readCanonicalActivityIntelligence } from "../../services/intelligence/readCanonicalActivityIntelligence";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";

export async function getActivityIntelligence(
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

    const canonical = await readCanonicalActivityIntelligence();
    const { intelligence } = canonical;

    const phase5Enabled = getFeatureFlags().phase5Communications;
    const retentionAsOf = new Date().toISOString();
    const projectedSixWeekPlans = phase5Enabled
      ? projectSixWeekVisitorFollowups(
          await new SixWeekFollowupEventsRepository().listAll(),
          retentionAsOf
        )
      : [];
    const realSixWeekPlans = phase5Enabled
      ? (await Promise.all(
          projectedSixWeekPlans.map(async plan => ({
            plan,
            visitor: await getVisitorById(plan.visitorId)
          }))
        ))
          .filter(entry => entry.visitor !== null && !isSyntheticVisitorRecord(entry.visitor))
          .map(entry => entry.plan)
      : [];
    const sixWeekRetention = phase5Enabled
      ? deriveSixWeekRetentionSummary(realSixWeekPlans, retentionAsOf)
      : null;

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        ...intelligence,
        followups: {
          ...intelligence.followups,
          owners: canonical.owners
        },
        sixWeekRetention,
        projectionIntegrity: {
          ...canonical.projectionIntegrity
        }
      }
    };
  } catch (err: any) {
    logFunctionError(context, "getActivityIntelligence", err, { requestId });

    context.res = {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "GET_ACTIVITY_INTELLIGENCE_FAILED",
        "Unexpected activity intelligence error",
        requestId
      )
    };
  }
}
