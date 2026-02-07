import type { Request, Response } from "express";
import type { VisitorsRepository } from "../../repositories";

function isValidEmail(email: string): boolean {
  // Intentionally basic: prevents obvious bad inputs without overfitting.
  // (We don't want a huge regex that rejects valid emails.)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createCreateVisitorAdapter(visitorsRepository: VisitorsRepository) {
  return async function createVisitorAdapter(req: Request, res: Response) {
    try {
      const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
      const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";

      if (!name) return res.status(400).json({ ok: false, error: "name is required" });
      if (!emailRaw) return res.status(400).json({ ok: false, error: "email is required" });
      if (!isValidEmail(emailRaw)) return res.status(400).json({ ok: false, error: "email is invalid" });      const existing = await visitorsRepository.getByEmail(emailRaw);

      if (existing) {
        // Idempotent: same email -> same visitorId
        return res.status(200).json({ ok: true, visitorId: existing.visitorId });
      }      const result = await visitorsRepository.create({ name, email: emailRaw });

      const status = result.created ? 201 : 200;
      return res.status(status).json({ ok: true, visitorId: result.visitor.visitorId });} catch (err: any) {
      console.error("CREATE_VISITOR_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "CREATE_VISITOR_FAILED" });
    }
  };
}


