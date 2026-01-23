import { Request, Response, NextFunction } from "express";

/**
 * Express-only API key middleware (no Azure Functions types).
 *
 * Expects:
 * - env: HOPE_API_KEY (preferred)
 * - header: x-api-key
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = (process.env.HOPE_API_KEY ?? "").trim();

  if (!expected) {
    // Fail closed if not configured (safer than accidentally exposing endpoints).
    return res.status(500).json({
      ok: false,
      error: "HOPE_API_KEY not configured",
    });
  }

  const provided =
    (req.header("x-api-key") ?? req.header("X-API-KEY") ?? "").trim();

  if (!provided || provided !== expected) {
    return res.status(401).json({
      ok: false,
      error: "unauthorized",
    });
  }

  return next();
}
