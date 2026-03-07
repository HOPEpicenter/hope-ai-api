import { requireApiKeyForFunction } from "../_shared/apiKey";
import { validateTimelineQueryV1 } from "../../contracts/timeline.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

const service = new EngagementsService(new EngagementEventsRepository());

export async function getEngagementStatus(context: any, req: any): Promise<void> {
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

    const parsed = validateTimelineQueryV1({
      visitorId: req?.query?.visitorId,
      limit: 1
    });

    if (!parsed.ok) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Query validation failed",
            details: parsed.issues.map((i: { path: string; message: string }) => ({
              path: i.path,
              message: i.message
            }))
          }
        }
      };
      return;
    }

    const { visitorId } = parsed.value;
    const status = await service.getCurrentStatus(visitorId);

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: {
        ok: true,
        ...status
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
