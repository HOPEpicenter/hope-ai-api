import { Router } from "express";
import type { VisitorsRepository } from "../../repositories";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { createCreateVisitorAdapter } from "./createVisitorAdapter";
import { createGetVisitorAdapter } from "./getVisitorAdapter";
import { createListVisitorsAdapter } from "./listVisitorsAdapter";
import { createGetVisitorSummaryAdapter } from "./createGetVisitorSummaryAdapter";
import { createGetVisitorDashboardCardAdapter } from "./createGetVisitorDashboardCardAdapter";
import { createGetVisitorJourneyAdapter } from "./createGetVisitorJourneyAdapter";
import { IntegrationService } from "../../services/integration/integrationService";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { AzureTableFormationEventsRepository } from "../../repositories/formationEventsRepository";

export default function visitorsRouter(visitorsRepository: VisitorsRepository) {
  const router = Router();

  const integrationService = new IntegrationService(
    new EngagementEventsRepository(),
    new AzureTableFormationEventsRepository()
  );

  router.post("/", createCreateVisitorAdapter(visitorsRepository));
  router.get("/:id", createGetVisitorAdapter(visitorsRepository));
  router.get("/:id/summary", requireApiKey, createGetVisitorSummaryAdapter());
  router.get("/:id/dashboard-card", requireApiKey, createGetVisitorDashboardCardAdapter(integrationService));
  router.get("/:id/journey", requireApiKey, createGetVisitorJourneyAdapter());

  // LIST /api/visitors?limit=5
  router.get("/", createListVisitorsAdapter(visitorsRepository));

  return router;
}


