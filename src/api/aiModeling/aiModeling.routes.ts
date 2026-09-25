import { Router } from "express";
import { AiModelingController } from "./aiModeling.controller";

export function createAiModelingRoutes(controller: AiModelingController): Router {
  const router = Router();
  router.get("/ai/predictions/:memberId", (req, res) => res.json(controller.getPredictions(req.params.memberId)));
  router.get("/ai/insights/:memberId", (req, res) => res.json(controller.getInsights(req.params.memberId)));
  router.get("/ai/recommendations/:memberId", (req, res) => res.json(controller.getRecommendations(req.params.memberId)));
  router.get("/ai/report/:memberId", (req, res) => res.json(controller.getReport(req.params.memberId)));
  return router;
}