import { getFeatureFlags } from "../../config/featureFlags";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { requireMinistryCommunicationStaffActor } from "../_shared/ministryCommunicationStaffActor";
import {
  cancelMinistryCommunication, readMinistryCommunications, recordMinistryCommunicationIntent,
  recordMinistryCommunicationOutcome, recordMinistryCommunicationPreference
} from "../../services/communications/ministryCommunicationCommands";
import { apiErrorBody, getRequestId, logFunctionError } from "../../shared/observability/functionObservability";

const headers = { "content-type": "application/json; charset=utf-8" };

function actionFor(req: any): string {
  const parameterAction = String(req?.params?.action ?? req?.params?.communicationId ?? "").trim();
  if (parameterAction) return parameterAction;
  const path = String(req?.originalUrl ?? req?.url ?? "");
  if (path.endsWith("/preferences")) return "preferences";
  if (path.endsWith("/intents")) return "intents";
  if (path.endsWith("/outcome")) return "outcome";
  if (path.endsWith("/cancel")) return "cancel";
  return "";
}

export async function ministryCommunications(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);
  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) { context.res = { status: auth.status, headers, body: auth.body }; return; }
    if (!getFeatureFlags().phase5Communications) {
      context.res = { status: 404, headers, body: { ok: false, requestId, code: "MINISTRY_COMMUNICATION_DISABLED", error: "Ministry communications are not enabled" } }; return;
    }
    const visitorId = String(req?.params?.visitorId ?? "").trim();
    if (!visitorId) { context.res = { status: 400, headers, body: { ok: false, requestId, error: "visitorId is required" } }; return; }
    const actor = await requireMinistryCommunicationStaffActor(req);
    if (!actor.ok) { context.res = { status: actor.status, headers, body: actor.body }; return; }
    if (String(req?.method ?? "").toUpperCase() === "GET") {
      context.res = { status: 200, headers, body: { ok: true, requestId, communication: await readMinistryCommunications(visitorId) } }; return;
    }
    const body = req?.body ?? {}; const action = actionFor(req);
    const result = action === "preferences"
      ? await recordMinistryCommunicationPreference({ visitorId, actorId: actor.actorId, channel: body.channel, state: body.state })
      : action === "intents"
        ? await recordMinistryCommunicationIntent({ visitorId, actorId: actor.actorId, communicationId: body.communicationId, channel: body.channel, intent: body.intent, context: body.context, relatedFollowupPlanId: body.relatedFollowupPlanId, notes: body.notes })
        : action === "outcome"
          ? await recordMinistryCommunicationOutcome({ visitorId, actorId: actor.actorId, communicationId: req?.params?.communicationId, outcome: body.outcome, notes: body.notes })
          : action === "cancel"
            ? await cancelMinistryCommunication({ visitorId, actorId: actor.actorId, communicationId: req?.params?.communicationId, reason: body.reason })
            : { accepted: false as const, status: 404, error: "Communication route not found" };
    context.res = { status: result.status, headers, body: result.accepted ? { ok: true, requestId, ...result } : { ok: false, requestId, error: result.error } };
  } catch (error: any) {
    logFunctionError(context, "ministryCommunications", error, { requestId, visitorId: req?.params?.visitorId ?? null });
    context.res = { status: 500, headers, body: apiErrorBody("MINISTRY_COMMUNICATION_FAILED", "Unable to process ministry communication", requestId) };
  }
}
