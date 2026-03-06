import { requireApiKeyForFunction } from "../_shared/apiKey";
import { validateEngagementEventEnvelopeV1Strict } from "../../contracts/engagementEvent.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

const service = new EngagementsService(new EngagementEventsRepository());

export async function postEngagementEvent(context: any, req: any): Promise<void> {
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

    await service.appendEvent(parsed.value);

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
