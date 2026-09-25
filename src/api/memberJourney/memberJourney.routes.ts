import { Router } from "express";
import { MemberJourneyController } from "./memberJourney.controller";

export function createMemberJourneyRoutes(controller: MemberJourneyController): Router {
  const router = Router();
  router.get("/journey/:memberId", (req, res) => res.json(controller.getJourney(req.params.memberId)));
  router.get("/journey/:memberId/summary", (req, res) => res.json(controller.getSummary(req.params.memberId)));
  router.get("/journey/:memberId/insights", (req, res) => res.json(controller.getInsights(req.params.memberId)));
  router.get("/journey/:memberId/recommendations", (req, res) => res.json(controller.getRecommendations(req.params.memberId)));
  router.get("/journey/:memberId/report", (req, res) => res.json(controller.getReport(req.params.memberId)));
  return router;
}