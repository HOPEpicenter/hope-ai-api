import { Router } from "express";
import { getDashboardFollowups } from "../../functions/getDashboardFollowups";
import { invokeFunction } from "../visitors/invokeFunction";

const router = Router();

router.get("/dashboard/followups", (req, res, next) => {
  invokeFunction(getDashboardFollowups, req, res).catch(next);
});

export default router;