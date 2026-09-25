import { Router } from "express";
import { FormationProfileController } from "./formationProfile.controller";

export function createFormationProfileRoutes(
  controller: FormationProfileController
) {
  const router = Router();

  router.get("/formation/profile/:memberId", (req, res) => {
    const profile = controller.getProfile(req.params.memberId);
    if (!profile) {
      return res.status(404).json({ error: "Formation profile not found" });
    }
    return res.json(profile);
  });

  router.get("/formation/profile/:memberId/active", (req, res) => {
    return res.json(controller.getActivePathway(req.params.memberId));
  });

  router.get("/formation/profile/:memberId/history", (req, res) => {
    return res.json(controller.getHistory(req.params.memberId));
  });

  router.get("/formation/profile/:memberId/stalled", (req, res) => {
    return res.json(controller.getStalledSteps(req.params.memberId));
  });

  return router;
}