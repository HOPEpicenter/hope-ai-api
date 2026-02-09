import { Router } from "express";
import {
  validateEngagementStatusQueryV1,
  validateEngagementStatusTransitionRequestV1,
} from "../../contracts/engagementStatus.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsStatusRouter = Router();

const service = new EngagementsService(new EngagementEventsRepository());

function newEventId(): string {
  // match the repo’s established randomUUID fallback pattern :contentReference[oaicite:6]{index=6}
  return (globalThis.crypto as any)?.randomUUID?.() ?? require("crypto").randomUUID();
}

function clampFromStatus(s: string | null): string {
  const v = (s ?? "unknown").trim() || "unknown";
  return v.length > 64 ? v.slice(0, 64) : v;
}

engagementsStatusRouter.get("/engagements/status", async (req, res, next) => {
  try {
    const parsed = validateEngagementStatusQueryV1(req.query);
    if (!parsed.ok) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Query validation failed",
          details: parsed.issues.map((i: { path: string; message: string }) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    const { visitorId } = parsed.value;
    const status = await service.getCurrentStatus(visitorId);

    return res.status(200).json(status);
  } catch (err) {
    return next(err);
  }
});

// POST /api/engagements/status/transitions
// Body: { visitorId, to, reason? }
engagementsStatusRouter.post("/engagements/status/transitions", async (req, res, next) => {
  try {
    const parsed = validateEngagementStatusTransitionRequestV1(req.body);
    if (!parsed.ok) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Body validation failed",
          details: parsed.issues.map((i: { path: string; message: string }) => ({
            path: i.path,
            message: i.message,
          })),
        },
      });
    }

    const { visitorId, to, reason } = parsed.value;

    // derive current status first so we can populate data.from (required by event validation) :contentReference[oaicite:7]{index=7}
    const current = await service.getCurrentStatus(visitorId);
    const from = clampFromStatus(current.status);

    const evt = {
      v: 1,
      eventId: newEventId(),
      visitorId,
      type: "status.transition",
      occurredAt: new Date().toISOString(),
      source: { system: "hope-ai-api" },
      data: { from, to, ...(reason ? { reason } : {}) },
    };

    await service.appendEvent(evt);

    const updated = await service.getCurrentStatus(visitorId);
    return res.status(200).json(updated);
  } catch (err) {
    return next(err);
  }
});
