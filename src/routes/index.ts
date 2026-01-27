import { Router } from "express";
import visitors from "./visitors";

const router = Router();

// Health check
router.get("/health", (req, res) => {
  res.json({ status: "ok", message: "Routes are wired" });
});

// Mount visitors under /api/visitors
router.use("/visitors", visitors);

export default router;
