import { Router } from "express";
import { ServingController } from "./serving.controller";

export function createServingRoutes(controller: ServingController): Router {
  const router = Router();
  router.get("/serving/profile/:memberId", (req, res) => res.json(controller.getProfile(req.params.memberId)));
  router.get("/serving/timeline/:memberId", (req, res) => res.json(controller.getTimeline(req.params.memberId)));
  router.get("/serving/milestones/:memberId", (req, res) => res.json(controller.getMilestones(req.params.memberId)));
  router.get("/serving/insights/:memberId", (req, res) => res.json(controller.getInsights(req.params.memberId)));
  router.get("/serving/recommendation/:memberId", (req, res) => res.json(controller.getRecommendation(req.params.memberId)));
  router.get("/serving/coaching/:memberId", (req, res) => res.json(controller.getCoaching(req.params.memberId)));
  router.get("/serving/report/:memberId", (req, res) => res.json(controller.getReport(req.params.memberId)));
  return router;
}