import { Router } from "express";
import { FormationProfileController } from "./formationProfile.controller";

export function createFormationProfileRoutes(
  controller: FormationProfileController
) {
  const router = Router();

  router.get("/formation/profile/:memberId", async (req, res, next) => {
    try {
      const profile = await controller.getProfile(req.params.memberId);
      if (!profile) {
        return res.status(404).json({ error: "Formation profile not found" });
      }
      return res.json(profile);
    } catch (error) {
      return next(error);
    }
  });

  router.get("/formation/profile/:memberId/active", async (req, res, next) => {
    try {
      return res.json(await controller.getActivePathway(req.params.memberId));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/formation/profile/:memberId/history", async (req, res, next) => {
    try {
      return res.json(await controller.getHistory(req.params.memberId));
    } catch (error) {
      return next(error);
    }
  });

  router.get("/formation/profile/:memberId/stalled", async (req, res, next) => {
    try {
      return res.json(await controller.getStalledSteps(req.params.memberId));
    } catch (error) {
      return next(error);
    }
  });

  return router;
}