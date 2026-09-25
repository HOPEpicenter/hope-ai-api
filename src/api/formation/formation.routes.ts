import { Router } from "express";
import { FormationController } from "./formation.controller";

export function createFormationRoutes(controller: FormationController) {
  const router = Router();

  router.post("/start", async (req, res) => {
    const result = await controller.startPathway(req.body);
    res.json(result);
  });

  router.post("/step/complete", async (req, res) => {
    const result = await controller.completeStep(req.body);
    res.json(result);
  });

  router.post("/step/stalled", async (req, res) => {
    const result = await controller.detectStepStalled(req.body);
    res.json(result);
  });

  router.post("/complete", async (req, res) => {
    const result = await controller.completePathway(req.body);
    res.json(result);
  });

  router.get("/", (req, res) => {
    res.json(controller.getAllPathways());
  });

  router.get("/member/:memberId", (req, res) => {
    res.json(controller.getPathwaysForMember(req.params.memberId));
  });

  router.get("/active", (req, res) => {
    res.json(controller.getActivePathways());
  });

  router.get("/stalled", (req, res) => {
    res.json(controller.getStalledPathways());
  });

  router.get("/completed", (req, res) => {
    res.json(controller.getCompletedPathways());
  });

  router.get("/:pathwayId/steps", (req, res) => {
    res.json(controller.getStepsForPathway(req.params.pathwayId));
  });

  return router;
}