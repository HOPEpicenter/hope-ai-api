import type { Request, Response, NextFunction } from "express";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 60;
const requestBuckets = new Map<string, { startedAt: number; count: number }>();

export function publicEngagementEventIngress(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const now = Date.now();
  const ip = req.ip || req.socket.remoteAddress || "unknown";
  const current = requestBuckets.get(ip);
  const bucket =
    !current || now - current.startedAt >= WINDOW_MS
      ? { startedAt: now, count: 0 }
      : current;

  bucket.count += 1;
  requestBuckets.set(ip, bucket);

  res.setHeader("RateLimit-Limit", String(MAX_REQUESTS));
  res.setHeader(
    "RateLimit-Remaining",
    String(Math.max(0, MAX_REQUESTS - bucket.count))
  );

  res.once("finish", () => {
    console.info(
      JSON.stringify({
        status: res.statusCode,
        eventId: req.body?.eventId,
        source: req.body?.source?.system,
        requestId: req.get("x-request-id") ?? undefined,
      })
    );
  });

  if (bucket.count > MAX_REQUESTS) {
    return res.status(429).json({
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: Math.ceil(
        (WINDOW_MS - (now - bucket.startedAt)) / 1000
      ),
    });
  }

  return next();
}
