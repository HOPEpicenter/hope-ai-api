import { requireApiKeyForFunction } from "../_shared/apiKey";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { validateEngagementScoreQueryV1, EngagementScoreV1 } from "../../contracts/engagementScore.v1";
import { computeEngagementScoreV1 } from "../../domain/engagement/computeEngagementScore.v1";

const service = new EngagementsService(new EngagementEventsRepository());

export async function getEngagementScore(context: any, req: any): Promise<void> {
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

    const parsed = validateEngagementScoreQueryV1(req?.query ?? {});
    if (!parsed.ok) {
      context.res = {
        status: 400,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: {
          ok: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Query validation failed",
            details: parsed.issues
          }
        }
      };
      return;
    }

    const { visitorId, windowDays } = parsed.value;

    const MAX_EVENTS = 2000;
    const PAGE_SIZE = 250;

    const all: any[] = [];
    let cursor: string | undefined = undefined;

    while (all.length < MAX_EVENTS) {
      const page = await service.readTimeline(visitorId, PAGE_SIZE, cursor);
      all.push(...(page.items ?? []));

      if (!page.nextCursor) { break }
      cursor = page.nextCursor;
    }

    const summary = computeEngagementScoreV1({ events: all as any, windowDays });

    const result: EngagementScoreV1 = {
      v: 1,
      visitorId,
      windowDays,
      engaged: summary.engaged,
      lastEngagedAt: summary.lastEngagedAt,
      daysSinceLastEngagement: summary.daysSinceLastEngagement,
      engagementCount: summary.engagementCount,
      score: summary.score,
      scoreReasons: summary.scoreReasons,
      needsFollowup: summary.needsFollowup
    };

    context.res = {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
      body: { ok: true, ...result }
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
