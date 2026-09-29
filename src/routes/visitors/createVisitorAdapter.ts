import type { Request, Response } from "express";
import { normalizePhoneIdentifier } from "../../repositories/visitorsRepository";
import type { VisitorsRepository } from "../../repositories";

function isValidEmail(email: string): boolean {
  // Intentionally basic: prevents obvious bad inputs without overfitting.
  // (We don't want a huge regex that rejects valid emails.)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function createCreateVisitorAdapter(visitorsRepository: VisitorsRepository) {
  return async function createVisitorAdapter(req: Request, res: Response) {
    try {
      const body = req.body ?? {};


      // Back-compat input normalization:
      // - preferred: body.name
      // - alias: body.fullName
      // - legacy: body.firstName + body.lastName
      const first = typeof body.firstName === "string" ? body.firstName.trim() : "";
      const last  = typeof body.lastName === "string" ? body.lastName.trim() : "";
      const legacyFull = [first, last].filter(Boolean).join(" ").trim();

      const nameRaw =
        (typeof body.name === "string" ? body.name : undefined) ??
        (typeof body.fullName === "string" ? body.fullName : undefined) ??
        (legacyFull.length > 0 ? legacyFull : undefined);

      const name = typeof nameRaw === "string" ? nameRaw.trim() : "";
      const emailRaw = typeof req.body?.email === "string" ? req.body.email.trim() : "";
      const phoneRaw = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";

      if (!name) return res.status(400).json({ ok: false, error: "name is required" });
      if (!emailRaw && !normalizePhoneIdentifier(phoneRaw)) return res.status(400).json({ ok: false, error: "email or phone is required" });
      if (emailRaw && !isValidEmail(emailRaw)) return res.status(400).json({ ok: false, error: "email is invalid" });

      const result = await visitorsRepository.create({ name, email: emailRaw || undefined, phone: phoneRaw || undefined });

      const status = result.created ? 201 : 200;
      return res.status(status).json({ ok: true, visitorId: result.visitor.visitorId });
    } catch (err: any) {
      if (err?.message === "VISITOR_IDENTIFIER_CONFLICT") {
        return res.status(409).json({ ok: false, error: "VISITOR_IDENTIFIER_CONFLICT" });
      }
      console.error("CREATE_VISITOR_FAILED", err?.message || err);
      return res.status(500).json({ ok: false, error: "CREATE_VISITOR_FAILED" });
    }
  };
}
