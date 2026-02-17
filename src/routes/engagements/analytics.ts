import { Router } from "express";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { EngagementAnalyticsV1 } from "../../contracts/engagementAnalytics.v1";

export const engagementsAnalyticsRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

engagementsAnalyticsRouter.get("/engagements/analytics", async (req, res, next) => {
  try {
    const visitorId = String(req.query.visitorId ?? "").trim();
    if (!visitorId) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "visitorId is required",
        },
      });
    }

    // Current status snapshot
    const current = await service.getCurrentStatus(visitorId);

    // Walk the event stream to compute analytics
    let cursor: string | undefined = undefined;
    const pageSize = 200;

    let total = 0;
    let engaged = 0;
    let disengaged = 0;

    let firstEngagedAt: string | null = null;
    let lastTransitionAt: string | null = null;

    // We treat "status.transition" events as the source of truth
    while (true) {
      const page = await service.readTimeline(visitorId, pageSize, cursor);
      for (const e of page.items) {
        if (e.type !== "status.transition") continue;

        total++;

        const to = String((e.data as any)?.to ?? "").toLowerCase();
        if (to === "engaged") {
          engaged++;
          if (!firstEngagedAt) firstEngagedAt = e.occurredAt ?? null;
        }
        if (to === "disengaged") {
          disengaged++;
        }

        // timeline is ordered by RowKey; track last seen transition time
        lastTransitionAt = e.occurredAt ?? lastTransitionAt;
      }

      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }

    const result: EngagementAnalyticsV1 = {
      v: 1,
      visitorId,
      currentStatus: (current.status ?? null) as any,
      currentStatusSince: current.lastChangedAt ? new Date(current.lastChangedAt as any).toISOString() : null,
      transitions: {
        total,
        engaged,
        disengaged,
      },
      firstEngagedAt,
      lastTransitionAt,
    };

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});
