import { timingSafeEqual } from "node:crypto";
import { permanentVisitorActivationPermitted } from "../../services/visitors/permanentVisitorPilotActivation";
import { DateTime } from "luxon";

import {
  getTableClient
} from "../_shared/tableClient";

import {
  listApprovedVisitorEvents
} from "../../services/visitors/listApprovedVisitorEvents";

import {
  resolvePermanentPublicVisitEvent,
  type PermanentPublicVisitEvent
} from "../../services/visitors/resolvePermanentPublicVisitEvent";

import {
  issuePermanentPublicVisitSession
} from "../../services/visitors/permanentPublicVisitSession";

import {
  reservePermanentPublicSessionCapacity,
  type SessionCapacityResult
} from "../../services/visitors/reservePermanentPublicSessionCapacity";

import {
  reservePermanentPublicVisitRequest,
  type PublicVisitRequestOperation,
  type PublicVisitRequestBudgetResult
} from "../../services/visitors/reservePermanentPublicVisitRequest";

type Request = {
  method?: string;
  headers?: Record<string, unknown> | Headers;
  body?: unknown;
};

type Context = {
  res?: {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
};

type Dependencies = {
  reserveRequest?: (
    operation: PublicVisitRequestOperation,
    nowMs: number
  ) => Promise<PublicVisitRequestBudgetResult>;

  now?: () => number;
  approvedEvents?: (
    date: string
  ) => Promise<readonly PermanentPublicVisitEvent[]>;
  reserve?: (
    nowMs: number
  ) => Promise<SessionCapacityResult>;
};

function reply(
  context: Context,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body
  };
}

function validSecret(
  value: unknown
): value is string {
  return typeof value === "string" &&
    value.length >= 32 &&
    value.length <= 512 &&
    value === value.trim() &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function authorizedBridge(
  request: Request,
  expected: string
): boolean {
  const actual =
    request.headers instanceof Headers
      ? request.headers.get("x-hope-public-visit-key")
      : request.headers?.["x-hope-public-visit-key"];

  if (!validSecret(actual)) {
    return false;
  }

  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");

  return left.length === right.length &&
    timingSafeEqual(left, right);
}

async function reserveLiveCapacity(
  nowMs: number
): Promise<SessionCapacityResult> {
  // Provision this dedicated table only during an
  // explicitly approved isolated deployment.
  const table = getTableClient(
    "PermanentVisitorSessionQuota"
  );

  return reservePermanentPublicSessionCapacity(
    table, nowMs
  );
}

/**
 * Server-to-server bridge endpoint.
 *
 * The browser must never receive the bridge key.
 * No device registration or Staff identity is required.
 * Feature flags remain default-off.
 */
export async function postPermanentPublicVisitSession(
  context: Context,
  request: Request,
  deps: Dependencies = {}
): Promise<void> {
  if (process.env.FEATURE_PERMANENT_PUBLIC_VISIT
        !== "true" ||
      process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD
        !== "true" ||
      process.env.FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP
        !== "true") {
    reply(context, 404, { status: "unavailable" });
    return;
  }

  if (!permanentVisitorActivationPermitted()) {
    reply(context, 503, { status: "unavailable" });
    return;
  }

  // Permanent registration cannot bypass its request protection.
  if (process.env.FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET
        !== "true") {
    reply(context, 503, { status: "unavailable" });
    return;
  }

  if (request.method !== "POST") {
    reply(context, 405, { status: "unavailable" });
    return;
  }

  const bridgeKey =
    process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY;

  const signingSecret =
    process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET;

  const claimSecret =
    process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET;

  if (!validSecret(bridgeKey) ||
      !validSecret(signingSecret) ||
      !validSecret(claimSecret) ||
      new Set([
        bridgeKey, signingSecret, claimSecret
      ]).size !== 3 ||
      Buffer.byteLength(signingSecret, "utf8") > 512 ||
      Buffer.byteLength(claimSecret, "utf8") > 512) {
    reply(context, 503, { status: "unavailable" });
    return;
  }

  if (!authorizedBridge(request, bridgeKey)) {
    reply(context, 401, { status: "unavailable" });
    return;
  }

  try {
    const body = request.body;

    if (!body ||
        typeof body !== "object" ||
        Object.getPrototypeOf(body) !== Object.prototype) {
      reply(context, 400, { status: "invalid" });
      return;
    }

    const input = body as Record<string, unknown>;

    if (Object.keys(input).some(
          key => key !== "eventId"
        ) ||
        (input.eventId !== undefined &&
         (typeof input.eventId !== "string" ||
          input.eventId.length > 160))) {
      reply(context, 400, { status: "invalid" });
      return;
    }

    const nowMs = (deps.now ?? Date.now)();

    if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
      reply(context, 503, { status: "unavailable" });
      return;
    }

    const date = DateTime.fromMillis(nowMs, {
      zone: "America/New_York"
    }).toISODate();

    if (!date) {
      reply(context, 503, { status: "unavailable" });
      return;
    }

    // Mandatory request protection precedes the calendar lookup.
    {
      const budget = deps.reserveRequest
        ? await deps.reserveRequest(
            "session", nowMs
          )
        : await reservePermanentPublicVisitRequest(
            getTableClient("PermanentVisitorSessionQuota"),
            "session",
            nowMs
          );

      if (budget !== "reserved") {
        reply(
          context,
          budget === "capacity_exhausted" ? 429 : 503,
          { status: "try_later" }
        );
        return;
      }
    }

    const approvedEvents = await (
      deps.approvedEvents ?? listApprovedVisitorEvents
    )(date);

    const eventContext = {
      enabled: true,
      nowMs,
      approvedEvents,
      selectedEventId: input.eventId
    };

    const event =
      resolvePermanentPublicVisitEvent(eventContext);

    if (event.status === "selection_required") {
      reply(context, 409, {
        status: "selection_required",
        date: event.date,
        events: event.events
      });
      return;
    }

    if (event.status !== "ready") {
      reply(
        context,
        event.status === "invalid_selection"
          ? 400 : 503,
        {
          status:
            event.status === "invalid_selection"
              ? "invalid" : "unavailable"
        }
      );
      return;
    }

    const token = issuePermanentPublicVisitSession(
      signingSecret,
      eventContext
    );

    if (!token) {
      reply(context, 503, { status: "unavailable" });
      return;
    }

    const capacity = await (
      deps.reserve ?? reserveLiveCapacity
    )(nowMs);

    if (capacity !== "reserved") {
      reply(
        context,
        capacity === "capacity_exhausted"
          ? 429 : 503,
        { status: "try_later" }
      );
      return;
    }

    // Return the short-lived session only to the
    // authenticated server-side bridge.
    reply(context, 200, {
      status: "ready",
      token,
      event: {
        serviceId: event.serviceId,
        date: event.date,
        name: event.name
      }
    });
  } catch {
    reply(context, 503, { status: "try_later" });
  }
}
