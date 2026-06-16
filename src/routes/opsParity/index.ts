import { Router } from "express";
import getOpsTaskPreviewSummary from "../../functions/getOpsTaskPreviewSummary";
import getOpsTaskPreviewSimulation from "../../functions/getOpsTaskPreviewSimulation";
import { postOpsFormationProfileAudit } from "../../functions/postOpsFormationProfileAudit";
import { invokeFunction } from "../visitors/invokeFunction";

const router = Router();

router.get("/ops/task-preview-summary", (req, res, next) => {
  invokeFunction(getOpsTaskPreviewSummary, req, res).catch(next);
});

router.get("/ops/task-preview-simulation", (req, res, next) => {
  invokeFunction(getOpsTaskPreviewSimulation, req, res).catch(next);
});

router.post("/_ops/formation/profile-audit", (req, res, next) => {
  invokeFunction(postOpsFormationProfileAudit, req, res).catch(next);
});

export default router;