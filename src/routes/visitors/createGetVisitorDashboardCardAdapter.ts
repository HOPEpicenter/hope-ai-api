import type { Request, Response } from "express";
import { readCanonicalVisitorDashboardCard } from "../../services/dashboard/readCanonicalVisitorDashboardCard";
import {
  readHighRiskStaffVisibility
} from "../../functions/_shared/highRiskStaffActor";
import {
  redactDashboardPastoralRisk
} from "../../services/authorization/redactDashboardPastoralRisk";

export function createGetVisitorDashboardCardAdapter() {
  return async function getVisitorDashboardCard(req: Request, res: Response) {
    const visibility =
      await readHighRiskStaffVisibility(req);

    if (!visibility.ok) {
      return res
        .status(visibility.status)
        .json(visibility.body);
    }

    const visitorId = String(req.params.id ?? "").trim();
    const requestId =
      (req as any).requestId as string | undefined;

    const canonicalCard =
      await readCanonicalVisitorDashboardCard(visitorId);

    const card =
      redactDashboardPastoralRisk(
        canonicalCard,
        visibility.canViewHighRiskAlerts
      );

    return res.json({
      ok: true,
      requestId,
      visitorId,
      card
    });
  };
}