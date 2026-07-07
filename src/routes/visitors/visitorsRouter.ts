import { Router } from "express";
import type { VisitorsRepository } from "../../repositories";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { createCreateVisitorAdapter } from "./createVisitorAdapter";
import { createGetVisitorAdapter } from "./getVisitorAdapter";
import { createListVisitorsAdapter } from "./listVisitorsAdapter";
import { createGetVisitorSummaryAdapter } from "./createGetVisitorSummaryAdapter";
import { createGetVisitorDashboardCardAdapter } from "./createGetVisitorDashboardCardAdapter";
import { createGetVisitorJourneyAdapter } from "./createGetVisitorJourneyAdapter";
import { postVisitorNote } from "../../functions/postVisitorNote";
import { getVisitorNotes } from "../../functions/getVisitorNotes";
import { patchVisitorNote } from "../../functions/patchVisitorNote";
import { updateVisitor } from "../../functions/updateVisitor";
import { getVisitorActivityInsights } from "../../functions/getVisitorActivityInsights";
import { invokeFunction } from "./invokeFunction";

export default function visitorsRouter(visitorsRepository: VisitorsRepository) {
  const router = Router();


  router.post("/", createCreateVisitorAdapter(visitorsRepository));
  router.patch("/:visitorId", (req, res, next) => {
    invokeFunction(updateVisitor, req, res).catch(next);
  });
  router.put("/:visitorId", (req, res, next) => {
    invokeFunction(updateVisitor, req, res).catch(next);
  });
  router.get("/:visitorId/notes", (req, res, next) => {
    invokeFunction(getVisitorNotes, req, res).catch(next);
  });
  router.patch("/:visitorId/notes/:noteId", (req, res, next) => {
    invokeFunction(patchVisitorNote, req, res).catch(next);
  });
  router.post("/:visitorId/notes", (req, res, next) => {
    invokeFunction(postVisitorNote, req, res).catch(next);
  });
  router.get("/:id", createGetVisitorAdapter(visitorsRepository));
  router.get("/:id/summary", requireApiKey, createGetVisitorSummaryAdapter());
  router.get("/:id/dashboard-card", requireApiKey, createGetVisitorDashboardCardAdapter());
  router.get("/:id/activity-insights", (req, res, next) => {
    invokeFunction(getVisitorActivityInsights, req, res).catch(next);
  });
  router.get("/:id/journey", requireApiKey, createGetVisitorJourneyAdapter());

  // LIST /api/visitors?limit=5
  router.get("/", createListVisitorsAdapter(visitorsRepository));

  return router;
}

