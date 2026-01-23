import type { Request, Response, NextFunction } from "express";

/**
 * Express-only API key guard.
 * - Checks header: x-api-key
 * - Compares to env: HOPE_API_KEY
 * - Responds 401 JSON on failure
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.HOPE_API_KEY;

  // If no key configured, fail closed (safer for prod).
  if (!expected) {
    return res.status(500).json({
      ok: false,
      error: "ServerMisconfigured",
      message: "HOPE_API_KEY is not set"
    });
  }

  const provided = getHeader(req, "x-api-key");

  if (!provided || provided !== expected) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      message: "Missing or invalid API key"
    });
  }

  return next();
}

function getHeader(req: Request, headerName: string): string | undefined {
  const raw = req.headers[headerName.toLowerCase()];
  if (Array.isArray(raw)) return raw[0];
  if (typeof raw === "string") return raw;
  return undefined;
}
