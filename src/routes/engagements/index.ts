import { Router } from "express";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";
import { engagementsStatusRouter } from "./status";
import { engagementsAnalyticsRouter } from "./analytics";
import { engagementsEventsRouter } from "./events";
import { engagementsTimelineRouter } from "./timeline";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { EngagementRepository } from "../../storage/engagementRepository";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";

export const engagementsRouter = Router();

const timelineService = new EngagementsService(new EngagementEventsRepository());
engagementsRouter.use(requireApiKey);

const engagementRepo = new EngagementRepository();
const engagementSummaryRepo = new EngagementSummaryRepository();

// POST /api/engagements
// body: { visitorId, type, channel?, notes?, note?, occurredAt?, id? }
engagementsRouter.post("/engagements", async (req, res) => {
  try {
    const { id, visitorId, type, channel, notes, occurredAt } = req.body ?? {};

    if (!visitorId || typeof visitorId !== "string") {
      return res.status(400).json({ ok: false, error: "visitorId is required" });
    }
    if (!type || typeof type !== "string") {
      return res.status(400).json({ ok: false, error: "type is required" });
    }

    const notesFinal = (((notes ?? (req.body as any)?.note) ?? "") as any).toString();
    const channelFinal = ((channel ?? "") as any).toString();
    const occurredAtFinal =
      occurredAt ? new Date(occurredAt).toISOString() : new Date().toISOString();

    const created = await engagementRepo.create({
      id,
      visitorId,
      type,
      channel: channelFinal,
      notes: notesFinal,
      occurredAt: occurredAtFinal,
    });

    return res.status(201).json(created);
  } catch (e: any) {
    console.error("[engagements] POST /engagements failed", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});

// GET /api/visitors/:id/engagements?limit=50&cursor=...  (legacy; prefer /engagements/timeline or /visitors/:id/engagements/v1)
engagementsRouter.get("/visitors/:id/engagements", async (req, res) => {
  try {
    const visitorId = req.params.id;

    const limitRaw = (req.query.limit as any) ?? "50";
    const cursorRaw = (req.query.cursor as any) ?? undefined;

    const limit = Math.max(1, Math.min(parseInt(String(limitRaw), 10) || 50, 200));
    const cursor = cursorRaw ? String(cursorRaw) : undefined;

    // Delegate to the same paging contract used by /engagements/timeline
    const page = await timelineService.readTimeline(visitorId, limit, cursor);

    return res.status(200).json({
      ok: true,
      visitorId,
      limit,
      cursor: page.nextCursor ?? null,
      items: page.items,
    });
  } catch (e: any) {
    console.error("[engagements] GET /visitors/:id/engagements failed", e);
    return res.status(500).json({ ok: false, error: "internal" });
  }
});



// GET /api/visitors/:id/engagements/v1?limit=50&cursor=...
// Canonical timeline read contract v1 (delegates to EngagementsService.readTimeline)
engagementsRouter.get("/visitors/:id/engagements/v1", async (req, res) => {
  try {
    const visitorId = req.params.id;

    const limitRaw = (req.query.limit as any) ?? "50";
    const cursorRaw = (req.query.cursor as any) ?? undefined;

    const limit = Math.max(1, Math.min(parseInt(String(limitRaw), 10) || 50, 200));
    const cursor = cursorRaw ? String(cursorRaw) : undefined;

    const page = await timelineService.readTimeline(visitorId, limit, cursor);

    return res.status(200).json({
      ok: true,
      v: 1,
      visitorId,
      limit,
      nextCursor: page.nextCursor ?? null,
      items: page.items,
    });
  } catch (e: any) {
    console.error("[engagements] GET /visitors/:id/engagements/v1 failed", e);
    return res.status(500).json({ ok: false, error: "internal" });
  }
});
// GET /api/visitors/:id/engagements/summary
engagementsRouter.get("/visitors/:id/engagements/summary", async (req, res) => {
  try {
    const visitorId = req.params.id;
    const summary = await engagementSummaryRepo.get(visitorId);
    return res.status(200).json({ ok: true, visitorId, summary: summary ?? null });
  } catch (e: any) {
    console.error("[engagements] GET /visitors/:id/engagements/summary failed", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
  }
});


// Engagement v1 additions (event envelope + timeline contract)
engagementsRouter.use(engagementsEventsRouter);
engagementsRouter.use(engagementsTimelineRouter);


// Engagement status v1 (derived from events)
engagementsRouter.use(engagementsStatusRouter);


engagementsRouter.use(engagementsAnalyticsRouter);





