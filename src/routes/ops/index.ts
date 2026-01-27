import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { getVisitorById } from "../../services/visitors/getVisitorById";
import { EngagementRepository } from "../../storage/engagementRepository";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";

export const opsRouter = Router();
opsRouter.use(requireApiKey);

/**
 * GET /api/ops/visitors/:id/dashboard?timelineLimit=50&timelineCursor=...
 *
 * Phase 3.1 (minimal) dashboard composition:
 * - visitor
 * - engagement summary snapshot
 * - timeline (engagements only for now; formation can be merged later)
 *
 * Cursor semantics: newest-first, cursor is exclusive upper-bound.
 * Cursor format matches EngagementRepository RowKey scheme: `${occurredAt}_${id}`
 */
opsRouter.get("/visitors/:id/dashboard", async (req, res) => {
  try {
    const visitorId = req.params.id;

    const timelineLimitRaw = (req.query.timelineLimit as any) ?? "50";
    const timelineCursor = (req.query.timelineCursor as any) ?? undefined;
    const timelineLimit = Math.max(1, Math.min(parseInt(timelineLimitRaw, 10) || 50, 200));

    const visitor = await getVisitorById(visitorId);

    const engagementRepo = new EngagementRepository();
    const engagementSummaryRepo = new EngagementSummaryRepository();

    const engagementSummary = await engagementSummaryRepo.get(visitorId);

    // Engagement timeline (newest-first)
    const engagementItems = await engagementRepo.listByVisitor(visitorId, timelineLimit, timelineCursor);

    const nextCursor =
      engagementItems.length > 0 && engagementItems.length >= timelineLimit
        ? `${engagementItems[engagementItems.length - 1].occurredAt}_${engagementItems[engagementItems.length - 1].id}`
        : "";

    const timelineItems = engagementItems.map((e: any) => ({
      kind: "engagement",
      ...e,
    }));

    return res.status(200).json({
      ok: true,
      visitorId,
      visitor,
      engagementSummary: engagementSummary ?? null,
      timeline: {
        limit: timelineLimit,
        cursor: nextCursor,
        items: timelineItems,
      },
    });
  } catch (e: any) {
    console.error("[ops] GET /visitors/:id/dashboard failed", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});