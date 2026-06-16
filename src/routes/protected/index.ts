import { Router } from "express";
import { protectedPing } from "../../functions/protectedPing";
import { invokeFunction } from "../visitors/invokeFunction";

const router = Router();

router.get("/_protected/ping", (req, res, next) => {
  invokeFunction(protectedPing, req, res).catch(next);
});

export default router;