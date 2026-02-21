import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "crypto";
import { ApiError } from "./apiError";

type LogLevel = "silent" | "info" | "debug";

function getLogLevel(): LogLevel {
  const raw = (process.env.OPS_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw === "silent") return "silent";
  if (raw === "debug") return "debug";
  return "info";
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.trim().length > 0 ? incoming : randomUUID();

  (req as any).requestId = requestId;
  res.setHeader("x-request-id", requestId);
  next();
}

export function errorMiddleware(err: unknown, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId as string | undefined;

  if (err instanceof ApiError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details,
      requestId,
    });
  }

  // Server-side logging (do not leak details to clients)
  const level = getLogLevel();
  if (level !== "silent") {
    try {
      const msg = err instanceof Error ? (err.stack || err.message) : String(err);
      const prefix = `Unhandled error rid=${requestId ?? "n/a"}`;
      // eslint-disable-next-line no-console
      console.error(`${prefix}: ${msg}`);

      if (level === "debug") {
        // eslint-disable-next-line no-console
        console.error(`debug rid=${requestId ?? "n/a"} ${req.method} ${req.originalUrl}`);
      }
    } catch {
      // ignore logging failures
    }
  }

  return res.status(500).json({
    error: "internal",
    message: "Internal server error",
    requestId,
  });
}
