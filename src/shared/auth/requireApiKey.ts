import type { Request, Response, NextFunction } from "express";

function pickHeader(req: Request): string {
  // Express normalizes headers to lower-case keys, but req.get() is safest.
  const v =
    req.get("x-api-key") ??
    req.get("X-API-KEY") ??
    req.headers["x-api-key"];

  if (typeof v === "string") return v;
  if (Array.isArray(v) && typeof v[0] === "string") return v[0];
  return "";
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    const expected = (process.env.HOPE_API_KEY ?? "").trim();
    if (!expected) {
      // Server misconfigured — don’t 401 the client for a server issue
      return res.status(500).json({ ok: false, error: "Server missing HOPE_API_KEY" });
    }

    const provided = pickHeader(req).trim();
    if (!provided) {
      return res.status(401).json({ ok: false, error: "Missing x-api-key" });
    }

    if (provided !== expected) {
      return res.status(401).json({ ok: false, error: "Invalid x-api-key" });
    }

    return next();
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message ?? "auth error" });
  }
}
