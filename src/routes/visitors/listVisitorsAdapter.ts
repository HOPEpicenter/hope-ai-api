import { Request, Response } from "express";
import { listVisitors } from "../../services/visitors/listVisitors";

function parseLimit(val: unknown, fallback = 25): number {
  const n = typeof val === "string" ? Number(val) : fallback;
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(Math.trunc(n), 200));
}

export async function listVisitorsAdapter(req: Request, res: Response) {
  const limit = parseLimit(req.query.limit, 25);
  const result = await listVisitors({ limit });
  return res.status(200).json(result);
}
