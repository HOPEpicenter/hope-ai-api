import { Router } from "express";
import { WorkloadOptimizationController } from "./workloadOptimization.controller";

export function createWorkloadOptimizationRoutes(controller: WorkloadOptimizationController): Router {
  const router = Router();
  router.get("/workload/member/:memberId", (req, res) => res.json(controller.getMember(req.params.memberId)));
  router.get("/workload/pastor/:pastorId", (req, res) => res.json(controller.getPastor(req.params.pastorId)));
  router.get("/workload/leadership/summary", (_req, res) => res.json(controller.getLeadershipSummary()));
  router.get("/workload/leadership/report", (_req, res) => res.json(controller.getLeadershipReport()));
  return router;
}