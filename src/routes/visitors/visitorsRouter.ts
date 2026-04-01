import { Router } from "express";
import type { VisitorsRepository } from "../../repositories";
import { requireApiKey } from "../../shared/auth/requireApiKey";
import { createCreateVisitorAdapter } from "./createVisitorAdapter";
import { createGetVisitorAdapter } from "./getVisitorAdapter";
import { createListVisitorsAdapter } from "./listVisitorsAdapter";
import { createGetVisitorSummaryAdapter } from "./createGetVisitorSummaryAdapter";

export default function visitorsRouter(visitorsRepository: VisitorsRepository) {
  const router = Router();

  router.post("/", createCreateVisitorAdapter(visitorsRepository));
  router.get("/:id", createGetVisitorAdapter(visitorsRepository));
  router.get("/:id/summary", requireApiKey, createGetVisitorSummaryAdapter());

  // LIST /api/visitors?limit=5
  router.get("/", createListVisitorsAdapter(visitorsRepository));

  return router;
}
