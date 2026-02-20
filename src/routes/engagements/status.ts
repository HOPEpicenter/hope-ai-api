import { Router } from "express";
import {
  validateEngagementStatusQueryV1,
  validateEngagementStatusTransitionRequestV1,
} from "../../contracts/engagementStatus.v1";
import { EngagementEventsRepository } from "../../repositories/engagementEventsRepository";
import { EngagementsService } from "../../services/engagements/engagementsService";

export const engagementsStatusRouter = Router();

function normalizeStatus(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

// Minimal v1 transition rules (tight + explicit).
function isAllowedTransition(from: string, to: string): boolean {
  // disallow transitions TO unknown (clients shouldn't set this explicitly)
  if (to === "unknown" || to === "") return false;

  // unknown/null can go to known states
  if (from === "unknown" || from === "") return to === "engaged" || to === "disengaged";

  // common states: engaged <-> disengaged only
  if (from === "engaged") return to === "disengaged";
  if (from === "disengaged") return to === "engaged";

  // If we don't recognize current state, be conservative: only allow known states.
  return to === "engaged" || to === "disengaged";
}


const service = new EngagementsService(new EngagementEventsRepository());

function newEventId(): string {
  return (globalThis.crypto as any)?.randomUUID?.() ?? require("crypto").randomUUID();
}

// Deterministic UUID-like string from a seed (for idempotency).
// Not a full RFC4122 v5 implementation, but stable and UUID-shaped.
function uuidFromSha256(seed: string): string {
  const hex: string = require("crypto")
    .createHash("sha256")
    .update(seed)
    .digest("hex")
    .slice(0, 32);

  const a = hex.slice(0, 8);
  const b = hex.slice(8, 12);
  const c = "5" + hex.slice(13, 16); // version-ish nibble
  const dNibble = parseInt(hex.slice(16, 17), 16);
  const d = ((dNibble & 0x3) | 0x8).toString(16) + hex.slice(17, 20); // variant-ish
  const e = hex.slice(20, 32);
  return `${a}-${b}-${c}-${d}-${e}`;
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
        ok: false,
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
    return res.status(200).json({
      ok: true,
      ...status,
    });
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
        ok: false,
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

    const idempotencyKeyRaw =
      (req.header("Idempotency-Key") ?? req.header("x-idempotency-key") ?? "").trim();
    const idempotencyKey = idempotencyKeyRaw ? idempotencyKeyRaw : undefined;

    if (idempotencyKey && idempotencyKey.length > 128) {
      return res.status(400).json({
        ok: false,
error: { code: "VALIDATION_ERROR", message: "Idempotency-Key too long (max 128 chars)" },
      });
    }

    // derive current status first so we can populate data.from
    const current = await service.getCurrentStatus(visitorId);
    const from = clampFromStatus(current.status);
    
    const toNorm = normalizeStatus(to);
    const fromNorm = normalizeStatus(from);

    // NOOP_TRANSITION: if state is unchanged, return current status without writing an event.
    if (toNorm === fromNorm) {
      return res.status(200).json(current);
    }

    // Enforce allowed transitions
    if (!isAllowedTransition(fromNorm, toNorm)) {
      return res.status(409).json({
        error: {
          code: "INVALID_TRANSITION",
          message: `Invalid transition from '${from}' to '${to}'`,
          details: { from, to },
        },
      });
    }
// Enforce allowed transitions
    const eventId = idempotencyKey ? uuidFromSha256(`${visitorId}|${idempotencyKey}`) : newEventId();
    const evt = {
      v: 1,
      eventId,
      visitorId,
      type: "status.transition",
      occurredAt: new Date().toISOString(),
      source: { system: "hope-ai-api" },
      data: { from, to, ...(reason ? { reason } : {}) },
    };

    await service.appendEvent(evt as any, { idempotencyKey });

    const updated = await service.getCurrentStatus(visitorId);
    return res.status(200).json({
      ok: true,
      ...updated,
    });
  } catch (err) {
    return next(err);
  }
});














