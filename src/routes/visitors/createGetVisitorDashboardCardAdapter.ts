import type { Request, Response } from "express";
import { readCanonicalVisitorDashboardCard } from "../../services/dashboard/readCanonicalVisitorDashboardCard";

export function createGetVisitorDashboardCardAdapter() {
  return async function getVisitorDashboardCard(req: Request, res: Response) {
    const visitorId = String(req.params.id ?? "").trim();
    const requestId = (req as any).requestId as string | undefined;

    const card = await readCanonicalVisitorDashboardCard(visitorId);

    return res.json({
      ok: true,
      requestId,
      visitorId,
      card
    });
  };
}