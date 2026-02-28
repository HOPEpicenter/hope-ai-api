import { Router } from "express";
import type { VisitorsRepository } from "../../repositories";
import { createCreateVisitorAdapter } from "./createVisitorAdapter";
import { createGetVisitorAdapter } from "./getVisitorAdapter";
import { createListVisitorsAdapter } from "./listVisitorsAdapter";

export default function visitorsRouter(visitorsRepository: VisitorsRepository) {
  const router = Router();

  router.post("/", createCreateVisitorAdapter(visitorsRepository));
  router.get("/:id", createGetVisitorAdapter(visitorsRepository));

  // LIST /api/visitors?limit=5
  router.get("/", createListVisitorsAdapter(visitorsRepository));

  return router;
}
