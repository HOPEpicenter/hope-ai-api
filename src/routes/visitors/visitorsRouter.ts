import { Router } from "express";
import { VisitorRepository } from "../../storage/visitorRepository";
import { createVisitorAdapter } from "./createVisitorAdapter";
import { getVisitorAdapter } from "./getVisitorAdapter";

const router = Router();

router.post("/", createVisitorAdapter);
router.get("/:id", getVisitorAdapter);

// LIST /api/visitors?limit=5
router.get("/", async (req, res) => {
  try {
    const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
    const limit = Math.max(1, Math.min(parseInt(limitRaw || "5", 10) || 5, 200));

    const repo = new VisitorRepository();
    const { items, count } = await repo.list({ limit });

    return res.status(200).json({ ok: true, items, count, limit });
  } catch (err: any) {
    console.error("LIST /visitors failed:", err?.message || err);
    return res.status(500).json({ ok: false, error: "LIST_VISITORS_FAILED" });
  }
});

export default router;
