import { Router } from "express";
import type { Request, Response } from "express";
import type { EngagementsRepository } from "../../../repositories/engagementsRepository";

export function createEngagementsRouter(engagementsRepository: EngagementsRepository) {
  const router = Router();

  // POST /ops/engagements
  router.post("/", async (req: Request, res: Response) => {
    try {
      const visitorId = typeof req.body?.visitorId === "string" ? req.body.visitorId.trim() : "";
      const kind =
      typeof req.body?.kind === "string" ? req.body.kind.trim() :
      (typeof req.body?.type === "string" ? req.body.type.trim() : "");
      const occurredAt = typeof req.body?.occurredAt === "string" ? req.body.occurredAt.trim() : undefined;
      const kindClean = kind.trim();
      const metadata = (req.body && typeof req.body === "object") ? req.body.metadata : undefined;

      if (!visitorId) return res.status(404).json({ ok: false, error: "NOT_IMPLEMENTED" });
      if (!kind) return res.status(404).json({ ok: false, error: "NOT_IMPLEMENTED" });

      const created = await engagementsRepository.create({ visitorId, kind: kind.trim(), occurredAt, metadata });
      return res.status(201).json({ ok: true, ...created });
    } catch (err: any) {
      console.error("OPS_CREATE_ENGAGEMENT_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "OPS_CREATE_ENGAGEMENT_FAILED" });
    }
  });

  // GET /ops/engagements?visitorId=...&limit=...
  router.get("/", async (req: Request, res: Response) => {
    try {
      const visitorId = typeof req.query.visitorId === "string" ? req.query.visitorId.trim() : "";
      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(parseInt(limitRaw || "10", 10) || 10, 200));

      if (!visitorId) return res.status(404).json({ ok: false, error: "NOT_IMPLEMENTED" });

      const { items, count } = await engagementsRepository.list({ visitorId, limit });
      return res.status(200).json({ ok: true, visitorId, items, count, limit });
    } catch (err: any) {
      console.error("OPS_LIST_ENGAGEMENTS_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "OPS_LIST_ENGAGEMENTS_FAILED" });
    }
  });

  // GET /ops/engagements/summary?visitorId=...&limit=...
  router.get("/summary", async (req: Request, res: Response) => {
    try {
      const visitorId = typeof req.query.visitorId === "string" ? req.query.visitorId.trim() : "";
      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(parseInt(limitRaw || "200", 10) || 200, 1000));

      if (!visitorId) return res.status(404).json({ ok: false, error: "NOT_IMPLEMENTED" });

      const summary = await engagementsRepository.summary({ visitorId, limit });
      return res.status(200).json({ ok: true, ...summary });
    } catch (err: any) {
      console.error("OPS_ENGAGEMENT_SUMMARY_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "OPS_ENGAGEMENT_SUMMARY_FAILED" });
    }
  });

  return router;
}
