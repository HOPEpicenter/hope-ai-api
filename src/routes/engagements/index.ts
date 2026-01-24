import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { EngagementRepository } from "../../storage/engagementRepository";

export const engagementsRouter = Router();
engagementsRouter.use(requireApiKey);

// POST /api/engagements
// body: { visitorId, type, channel?, notes?, occurredAt? }
engagementsRouter.post("/engagements", async (req, res) => {
  try {
    const { id, visitorId, type, channel, notes, occurredAt } = req.body ?? {};

    if (!visitorId || typeof visitorId !== "string") {
      return res.status(400).json({ ok: false, error: "visitorId is required" });
    }
    if (!type || typeof type !== "string") {
      return res.status(400).json({ ok: false, error: "type is required" });
    }

    const repo = new EngagementRepository();
    const created = await repo.create({
      id: (typeof id === "string" && id.trim()) ? id.trim() : undefined,
      visitorId,
      type,
      channel: typeof channel === "string" ? channel : undefined,
      notes: typeof notes === "string" ? notes : undefined,
      occurredAt: typeof occurredAt === "string" ? occurredAt : undefined,
    });

    return res.status(201).json(created);
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "unknown error" });
  }
});

// GET /api/visitors/:id/engagements?limit=50
engagementsRouter.get("/visitors/:id/engagements", async (req, res) => {
  try {
    const visitorId = req.params.id;
    const limitRaw = (req.query.limit as any) ?? "50";
    const limit = Math.max(1, Math.min(parseInt(String(limitRaw), 10) || 50, 200));

    const repo = new EngagementRepository();
    const items = await repo.listByVisitor(visitorId, limit);

    return res.json({ ok: true, visitorId, items, count: items.length, limit });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "unknown error" });
  }
});
