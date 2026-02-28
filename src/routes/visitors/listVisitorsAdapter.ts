import type { Request, Response } from "express";
import type { VisitorsRepository } from "../../repositories";
import { listVisitors } from "../../services/visitors/listVisitors";

function parseLimit(val: unknown, fallback = 25): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export function createListVisitorsAdapter(visitorsRepository: VisitorsRepository) {
  return async function listVisitorsAdapter(req: Request, res: Response) {
    try {
      const limit = parseLimit(req.query.limit, 25);
      const result = await listVisitors({ visitorsRepository, limit });
      return res.status(200).json(result);
    } catch (err: any) {
      console.error("LIST_VISITORS_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "LIST_VISITORS_FAILED" });
    }
  };
}
