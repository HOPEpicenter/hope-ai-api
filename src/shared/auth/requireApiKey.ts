import type { Request, Response, NextFunction } from "express";

function pickHeader(req: Request): string {
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
    const provided = pickHeader(req).trim();

    console.log("[auth-check]", JSON.stringify({
      expectedConfigured: Boolean(expected),
      providedPresent: Boolean(provided),
      matched: Boolean(expected && provided && provided === expected),
      method: req.method,
      originalUrl: req.originalUrl
    }));
    if (!expected) {
      return res.status(500).json({ ok: false, error: "Server missing HOPE_API_KEY" });
    }

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

