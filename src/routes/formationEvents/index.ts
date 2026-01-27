import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { FormationEventRepository } from "../../storage/formationEventRepository";

export const formationEventsRouter = Router();
formationEventsRouter.use(requireApiKey);

const repo = new FormationEventRepository();

// POST /formation/events  (mounted under /api in src/index.ts, matching Engagements pattern)
formationEventsRouter.post("/formation/events", async (req, res) => {
  try {
    const { visitorId, type, notes, occurredAt, id } = req.body || {};
    const created = await repo.create({ visitorId, type, notes, occurredAt, id });
    return res.status(201).json(created);
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Bad Request" });
  }
});

// GET /visitors/:id/formation/events?limit=&cursor=
formationEventsRouter.get("/visitors/:id/formation/events", async (req, res) => {
  try {
    const visitorId = String(req.params.id || "").trim();
    const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
    const cursor = req.query.cursor ? String(req.query.cursor) : undefined;

    const out = await repo.listByVisitor(visitorId, limit, cursor);
    return res.status(200).json({ ok: true, visitorId, items: out.items, cursor: out.cursor });
  } catch (e: any) {
    return res.status(400).json({ ok: false, error: e?.message || "Bad Request" });
  }
});