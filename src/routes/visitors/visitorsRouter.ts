import { Router } from "express";
import type { VisitorsRepository } from "../../repositories";
import { createCreateVisitorAdapter } from "./createVisitorAdapter";
import { createGetVisitorAdapter } from "./getVisitorAdapter";

export default function visitorsRouter(visitorsRepository: VisitorsRepository) {
  const router = Router();

  router.post("/", createCreateVisitorAdapter(visitorsRepository));
  router.get("/:id", createGetVisitorAdapter(visitorsRepository));

  // LIST /api/visitors?limit=5
  router.get("/", async (req, res) => {
    try {
      const limitRaw = typeof req.query.limit === "string" ? req.query.limit : "";
      const limit = Math.max(1, Math.min(parseInt(limitRaw || "5", 10) || 5, 200));

      const { items, count } = await visitorsRepository.list({ limit });
      return res.status(200).json({ ok: true, items, count, limit });
    } catch (err: any) {
      console.error("LIST_VISITORS_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "LIST_VISITORS_FAILED" });
    }
  });

  return router;
}
