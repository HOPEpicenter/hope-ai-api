import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { EngagementRepository } from "../../storage/engagementRepository";
import { EngagementSummaryRepository } from "../../storage/engagementSummaryRepository";

export const engagementsRouter = Router();
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

// GET /api/visitors/:id/engagements?limit=50&cursor=...
engagementsRouter.get("/visitors/:id/engagements", async (req, res) => {
  try {
    const visitorId = req.params.id;
    const limitRaw = (req.query.limit as any) ?? "50";
    const cursor = (req.query.cursor as any) ?? undefined;

    const limit = Math.max(1, Math.min(parseInt(limitRaw, 10) || 50, 200));
    const items = await engagementRepo.listByVisitor(visitorId, limit, cursor);

    const nextCursor =
      items.length > 0 && items.length >= limit
        ? `${items[items.length - 1].occurredAt}_${items[items.length - 1].id}`
        : "";

    return res.status(200).json({ ok: true, visitorId, items, cursor: nextCursor });
  } catch (e: any) {
    console.error("[engagements] GET /visitors/:id/engagements failed", e);
    return res.status(500).json({ ok: false, error: "internal_error" });
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
