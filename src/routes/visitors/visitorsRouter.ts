import { Router } from "express";
import { createVisitorAdapter } from "./createVisitorAdapter";
import { getVisitorAdapter } from "./getVisitorAdapter";

const router = Router();

router.post("/", createVisitorAdapter);
router.get("/:id", getVisitorAdapter);

export default router;