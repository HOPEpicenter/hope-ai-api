import { Router } from "express";
import { PastoralBriefingController } from "./pastoralBriefing.controller";

export function createPastoralBriefingRoutes(controller: PastoralBriefingController): Router {
  const router = Router();
  router.get("/briefing/daily", (_req, res) => res.json(controller.getDaily()));
  router.get("/briefing/weekly", (_req, res) => res.json(controller.getWeekly()));
  router.get("/briefing/events", (_req, res) => res.json(controller.getEvents()));
  router.get("/briefing/report/daily", (_req, res) => res.json(controller.getDailyReport()));
  router.get("/briefing/report/weekly", (_req, res) => res.json(controller.getWeeklyReport()));
  router.get("/briefing/report/events", (_req, res) => res.json(controller.getEventsReport()));
  return router;
}