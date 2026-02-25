import type { NextFunction, Request, Response } from "express";

type LogLevel = "silent" | "info" | "debug";

function getLogLevel(): LogLevel {
  const raw = (process.env.OPS_LOG_LEVEL || process.env.LOG_LEVEL || "info").toLowerCase();
  if (raw === "silent") return "silent";
  if (raw === "debug") return "debug";
  return "info";
}

export function requestLogMiddleware(req: Request, res: Response, next: NextFunction) {
  const level = getLogLevel();
  if (level === "silent") return next();

  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    const requestId = (req as any).requestId as string | undefined;

    const base =
      `${res.statusCode} ${req.method} ${req.originalUrl} ${ms}ms` +
      (requestId ? ` rid=${requestId}` : "");

    // eslint-disable-next-line no-console
    console.log(base);

    if (level === "debug") {
      // eslint-disable-next-line no-console
      console.log(`debug rid=${requestId ?? "n/a"} ip=${req.ip} ua=${req.get("user-agent") ?? ""}`);
    }
  });

  next();
}
