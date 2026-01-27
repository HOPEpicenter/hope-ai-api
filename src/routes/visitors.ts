import { Router } from "express";
import { createVisitorAdapter } from "./createVisitorAdapter";
import { getVisitorAdapter } from "./getVisitorAdapter";

const router = Router();

// POST /api/visitors
router.post("/visitors", createVisitorAdapter);

// GET /api/visitors/:id
router.get("/visitors/:id", getVisitorAdapter);

export default router;
