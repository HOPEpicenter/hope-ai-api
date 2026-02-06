import type { Request, Response } from "express";
import type { VisitorsRepository } from "../../repositories";

export function createGetVisitorAdapter(visitorsRepository: VisitorsRepository) {
  return async function getVisitorAdapter(req: Request, res: Response) {
    try {
      const id = typeof req.params?.id === "string" ? req.params.id.trim() : "";
      if (!id) return res.status(400).json({ ok: false, error: "id is required" });

      const visitor = await visitorsRepository.getById(id);
      if (!visitor) return res.status(404).json({ ok: false, error: "NOT_FOUND" });

      return res.status(200).json({ ok: true, ...visitor });
    } catch (err: any) {
      console.error("GET_VISITOR_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "GET_VISITOR_FAILED" });
    }
  };
}
