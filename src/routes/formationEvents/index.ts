import { Router } from "express";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { FormationEventRepository } from "../../storage/formationEventRepository";

export const formationEventsRouter = Router();
formationEventsRouter.use(requireApiKey);

const repo = new FormationEventRepository();

function isConflictAlreadyExists(err: any): boolean {
  const status = err?.statusCode ?? err?.status;
  const code =
    err?.details?.odataError?.code ??
    err?.details?.errorCode ??
    err?.code ??
    err?.name;

  const msg = String(err?.message ?? "");
  const msgHasAlreadyExists =
    msg.includes("EntityAlreadyExists") ||
    msg.includes("The specified entity already exists") ||
    msg.includes("odata.error") && msg.includes("AlreadyExists");

  return status === 409 || code === "EntityAlreadyExists" || msgHasAlreadyExists;
}

function toHttpStatus(err: any, fallback = 400): number {
  const s = err?.statusCode ?? err?.status;
  const n = typeof s === "number" ? s : parseInt(String(s ?? ""), 10);
  return Number.isFinite(n) && n >= 100 && n <= 599 ? n : fallback;
}

// POST /formation/events  (mounted under /api in src/index.ts, matching Engagements pattern)
formationEventsRouter.post("/formation/events", async (req, res) => {
  const { visitorId, type, notes, occurredAt, id } = req.body || {};

  try {
    const created = await repo.create({ visitorId, type, notes, occurredAt, id });
    return res.status(201).json(created);
  } catch (e: any) {
    // Idempotent retry: if client supplied an id and the entity already exists, return existing.
    if (id && isConflictAlreadyExists(e)) {
      try {
        const existing = await repo.getByVisitorAndId(visitorId, id);
        if (existing) return res.status(200).json(existing);
      } catch {
        // fall through to conflict below
      }
      return res.status(409).json({ ok: false, error: "EntityAlreadyExists" });
    }

    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
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
    return res.status(toHttpStatus(e, 400)).json({ ok: false, error: e?.message || "Bad Request" });
  }
});