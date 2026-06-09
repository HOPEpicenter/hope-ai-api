import { validateEngagementEventEnvelopeV1Strict } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { resolveMutationSource } from "../../services/events/resolveMutationSource";
import {
  apiErrorBody,
  getRequestId,
  logFunctionError
} from "../../shared/observability/functionObservability";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import { recordFormationEventV1 } from "../_shared/formation";

const service = new EngagementsService(new EngagementEventsRepository());

export async function postEngagementEvent(context: any, req: any): Promise<void> {
  const requestId = getRequestId(req);

  try {
    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      context.log.warn("postEngagementEvent auth rejected");
      context.res = {
        status: auth.status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ...auth.body,
          authRejectedBy: "postEngagementEvent"
        }
      };
      return;
    }

    const body = req?.body ?? {};
    const parsed = validateEngagementEventEnvelopeV1Strict(body);

    if (!parsed.ok) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          requestId,
          error: {
            code: "VALIDATION_ERROR",
            message: "Body validation failed",
            details: parsed.issues
          }
        }
      };
      return;
    }

    const evt = parsed.value;

    if (!evt.visitorId || typeof evt.visitorId !== "string" || evt.visitorId.trim() === "") {
      throw new Error("visitorId must be a non-empty string");
    }

    if (!evt.type || typeof evt.type !== "string" || evt.type.trim() === "") {
      throw new Error("type must be a non-empty string");
    }

    const occurredAtDate = new Date(evt.occurredAt);
    if (isNaN(occurredAtDate.getTime())) {
      throw new Error("occurredAt must be valid ISO datetime");
    }

    const now = Date.now();
    if (occurredAtDate.getTime() > now + 5 * 60 * 1000) {
      throw new Error("occurredAt cannot be in the future");
    }

    await service.appendEvent(evt);

    const type = String(evt.type ?? "").trim();

    const formationTypes = [
      "FOLLOWUP_ASSIGNED",
      "FOLLOWUP_CONTACTED",
      "FOLLOWUP_OUTCOME_RECORDED",
      "FOLLOWUP_UNASSIGNED"
    ];

    if (formationTypes.includes(type)) {
      await recordFormationEventV1({
        v: 1,
        eventId: evt.eventId,
        visitorId: evt.visitorId,
        type,
        occurredAt: evt.occurredAt,
        source: resolveMutationSource({
          system: "engagements",
          actorId: evt.source.actorId
        }),
        data: evt.data ?? {}
      });
    }

    context.res = {
      status: 202,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        requestId,
        accepted: true,
        v: 1
      }
    };
  } catch (err: any) {
    logFunctionError(context, "postEngagementEvent", err, {
      requestId,
      visitorId: req?.body?.visitorId ?? null,
      eventId: req?.body?.eventId ?? null,
      type: req?.body?.type ?? null
    });

    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: apiErrorBody(
        "ENGAGEMENT_EVENT_BAD_REQUEST",
        err?.message ?? "Bad Request",
        requestId
      )
    };
  }
}
