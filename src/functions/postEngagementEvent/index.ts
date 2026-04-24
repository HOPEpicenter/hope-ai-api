import { validateEngagementEventEnvelopeV1Strict } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { recordFormationEventV1 } from "../_shared/formation";

const service = new EngagementsService(new EngagementEventsRepository());

export async function postEngagementEvent(context: any, req: any): Promise<void> {
  try {

    const body = req?.body ?? {};
    const parsed = validateEngagementEventEnvelopeV1Strict(body);

    if (!parsed.ok) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
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

    // --- DOMAIN SAFETY GUARDS ---
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

    // Bridge: engagement → formation
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
        source: { system: "engagements" },
        data: evt.data ?? {}
      });
    }

    context.res = {
      status: 202,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        accepted: true,
        v: 1
      }
    };
  } catch (err: any) {
    context.log.error(err?.message ?? err);
    context.res = {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: false, error: err?.message ?? "Bad Request" }
    };
  }
}
