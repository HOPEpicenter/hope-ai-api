import type { Request, Response, NextFunction } from "express";

type StaffRequest = Request & { staffPrincipalId?: string };

export function requireStaffIdentity(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const principalId = req.get("x-ms-client-principal-id")?.trim();

  if (!principalId) {
    return res.status(401).json({
      ok: false,
      error: "staff_identity_required",
    });
  }

  const allowedIds = (process.env.HOPE_STAFF_PRINCIPAL_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (allowedIds.length > 0 && !allowedIds.includes(principalId)) {
    return res.status(403).json({
      ok: false,
      error: "staff_identity_not_allowed",
    });
  }

  (req as StaffRequest).staffPrincipalId = principalId;
  return next();
}
