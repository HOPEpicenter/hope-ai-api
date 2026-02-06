import type { Request, Response } from "express";
import type { VisitorsRepository } from "../../repositories";

export function createCreateVisitorAdapter(visitorsRepository: VisitorsRepository) {
  return async function createVisitorAdapter(req: Request, res: Response) {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const email = typeof req.body?.email === "string" ? req.body.email.trim() : undefined;

      if (!name) return res.status(400).json({ ok: false, error: "name is required" });

      const created = await visitorsRepository.create({ name, email });

      return res.status(201).json({ ok: true, ...created });
    } catch (err: any) {
      console.error("CREATE_VISITOR_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "CREATE_VISITOR_FAILED" });
    }
  };
}
