import { Router } from "express";
import { CareController } from "./care.controller";

export function createCareRoutes(controller: CareController): Router {
  const router = Router();
  router.get("/care/profile/:memberId", (req, res) => res.json(controller.getProfile(req.params.memberId)));
  router.get("/care/profile/:memberId/timeline", (req, res) => res.json(controller.getTimeline(req.params.memberId)));
  router.get("/care/profile/:memberId/milestones", (req, res) => res.json(controller.getMilestones(req.params.memberId)));
  router.get("/care/profile/:memberId/insights", (req, res) => res.json(controller.getInsights(req.params.memberId)));
  router.get("/care/profile/:memberId/recommendations", (req, res) => res.json(controller.getRecommendations(req.params.memberId)));
  router.get("/care/profile/:memberId/alerts", (req, res) => res.json(controller.getAlerts(req.params.memberId)));
  router.get("/care/analytics", (_req, res) => res.json(controller.getAnalytics()));
  router.get("/care/profile/:memberId/coaching", (req, res) => res.json(controller.getCoaching(req.params.memberId)));
  router.get("/care/profile/:memberId/report", (req, res) => res.json(controller.getReport(req.params.memberId)));
  return router;
}