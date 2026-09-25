import { Router } from "express";
import { PredictiveIntelligenceController } from "./predictiveIntelligence.controller";

export function createPredictiveIntelligenceRoutes(controller: PredictiveIntelligenceController): Router {
  const router = Router();
  router.get("/predictive/member/:memberId", (req, res) => res.json(controller.getMember(req.params.memberId)));
  router.get("/predictive/leadership/summary", (_req, res) => res.json(controller.getSummary()));
  router.get("/predictive/leadership/actions", (_req, res) => res.json(controller.getActions()));
  router.get("/predictive/leadership/report", (_req, res) => res.json(controller.getReport()));
  return router;
}