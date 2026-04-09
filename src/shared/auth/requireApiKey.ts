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

function isPublicApiKeyBypass(req: Request): boolean {
  return req.method === "POST" && req.originalUrl === "/api/engagements/events";
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  try {
    if (isPublicApiKeyBypass(req)) {
      return next();
    }

    const expected = (process.env.HOPE_API_KEY ?? "").trim();
    console.log("[auth-check]", JSON.stringify({
      expected,
      provided: pickHeader(req).trim(),
      method: req.method,
      originalUrl: req.originalUrl
    }));
    if (!expected) {
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

