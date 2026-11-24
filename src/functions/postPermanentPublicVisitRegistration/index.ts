import { timingSafeEqual } from "node:crypto";
import { DateTime } from "luxon";

import {
  getTableClient
} from "../_shared/tableClient";

import {
  listApprovedVisitorEvents
} from "../../services/visitors/listApprovedVisitorEvents";

import type {
  PermanentPublicVisitEvent
} from "../../services/visitors/resolvePermanentPublicVisitEvent";

import {
  submitPermanentPublicVisitRegistration,
  type PermanentPublicRegistrationDependencies
} from "../../services/visitors/submitPermanentPublicVisitRegistration";

import {
  verifyPermanentPublicVisitSessionForRecovery
} from "../../services/visitors/verifyPermanentPublicVisitSessionForRecovery";

import {
  preparePermanentPublicVisitRegistration
} from "../../services/visitors/preparePermanentPublicVisitRegistration";

import {
  reservePermanentPublicVisitRequest,
  type PublicVisitRequestOperation,
  type PublicVisitRequestBudgetResult
} from "../../services/visitors/reservePermanentPublicVisitRequest";

type Request = {
  method?: string;
  headers?: Record<string, unknown> | Headers;
  body?: unknown;
  rawBody?: string;
};

type Context = {
  res?: {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
};

type Runtime = Pick<
  PermanentPublicRegistrationDependencies,
  "store" |
  "recordAdult" |
  "recordFamily" |
  "enrollFollowup"
>;

type Dependencies = {
  reserveRequest?: (
    operation: PublicVisitRequestOperation,
    nowMs: number
  ) => Promise<PublicVisitRequestBudgetResult>;

  now?: () => number;

  approvedEvents?: (
    date: string
  ) => Promise<readonly PermanentPublicVisitEvent[]>;

  runtime?: () => Promise<Runtime>;
};

const MAX_BODY_BYTES = 16384;

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

function header(
  request: Request,
  name: string
): unknown {
  return request.headers instanceof Headers
    ? request.headers.get(name)
    : request.headers?.[name];
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
  const actual = header(
    request, "x-hope-public-visit-key"
  );

  if (!validSecret(actual)) return false;

  const left = Buffer.from(actual, "utf8");
  const right = Buffer.from(expected, "utf8");

  return left.length === right.length &&
    timingSafeEqual(left, right);
}

function plainObject(
  value: unknown
): value is Record<string, unknown> {
  return value !== null &&
    typeof value === "object" &&
    Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * Construct the actual canonical runtime only after
 * bridge authorization and session validation.
 *
 * The admission table must be provisioned through
 * an approved deployment, not by a public request.
 */
async function liveRuntime(): Promise<Runtime> {
  const {
    createPermanentVisitorQrReservationStore
  } = await import(
    "../../repositories/permanentVisitorQrReservationStore"
  );

  const {
    recordVisitorArrival
  } = await import(
    "../../services/visitors/recordVisitorArrival"
  );

  const {
    recordVisitorFamilyCheckIn
  } = await import(
    "../../services/visitors/recordVisitorFamilyCheckIn"
  );

  const {
    enrollRecordedPublicVisitor
  } = await import(
    "../../services/followups/enrollRecordedPublicVisitor"
  );

  const {
    SixWeekFollowupEventsRepository
  } = await import(
    "../../repositories/sixWeekFollowupEventsRepository"
  );

  const reservations = getTableClient(
    "PermanentVisitorAdmission"
  );

  const visitors = getTableClient("Visitors");

  const followups =
    new SixWeekFollowupEventsRepository();

  return {
    store:
      createPermanentVisitorQrReservationStore(
        reservations
      ),

    recordAdult: recordVisitorArrival,

    recordFamily: recordVisitorFamilyCheckIn,

    enrollFollowup: evidence =>
      enrollRecordedPublicVisitor(evidence, {
        enabled: true,
        visitors,
        repository: followups
      })
  };
}

/**
 * Permanent server-to-server registration submission.
 *
 * The public browser never receives the bridge key
 * or the backend signing and claim secrets.
 *
 * No Staff identity, owner activation or registered
 * device is required for visitor admission.
 */
export async function postPermanentPublicVisitRegistration(
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

  const contentType = header(
    request, "content-type"
  );

  if (typeof contentType !== "string" ||
      contentType.split(";")[0]
        .trim().toLowerCase() !== "application/json") {
    reply(context, 415, { status: "invalid" });
    return;
  }

  try {
    const input = request.body;

    if (!plainObject(input) ||
        Object.keys(input).some(key =>
          !["token", "submissionId", "body"]
            .includes(key)
        ) ||
        typeof input.token !== "string" ||
        input.token.length === 0 ||
        input.token.length > 4096 ||
        typeof input.submissionId !== "string" ||
        input.submissionId.length !== 36 ||
        !plainObject(input.body)) {
      reply(context, 400, { status: "invalid" });
      return;
    }

    if ((typeof request.rawBody === "string" &&
         Buffer.byteLength(
           request.rawBody, "utf8"
         ) > MAX_BODY_BYTES) ||
        Buffer.byteLength(
          JSON.stringify(input), "utf8"
        ) > MAX_BODY_BYTES) {
      reply(context, 413, { status: "invalid" });
      return;
    }

    const nowMs = (deps.now ?? Date.now)();

    if (!Number.isSafeInteger(nowMs) ||
        nowMs < 0) {
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

    // Additional request protection is staged
    // independently of the existing admission limits.
    if (process.env.FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET
          === "true") {
      const budget = deps.reserveRequest
        ? await deps.reserveRequest(
            "registration", nowMs
          )
        : await reservePermanentPublicVisitRequest(
            getTableClient("PermanentVisitorSessionQuota"),
            "registration",
            nowMs
          );

      if (budget !== "reserved") {
        reply(
          context,
          budget === "capacity_exhausted" ? 429 : 503,
          { status: "try_later", accepted: false }
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
      approvedEvents
    };

    const prepared =
      preparePermanentPublicVisitRegistration(
        {
          submissionId: input.submissionId,
          body: input.body
        },
        eventContext,
        true
      );

    if (prepared.status !== "ready") {
      reply(
        context,
        prepared.status === "selection_required"
          ? 409
          : prepared.status === "invalid"
            ? 400
            : 503,
        { status: prepared.status }
      );
      return;
    }

    // Verify the session before constructing storage
    // dependencies. The pipeline verifies it again
    // at the durable reservation boundary.
    if (!verifyPermanentPublicVisitSessionForRecovery(
      input.token,
      signingSecret,
      {
        ...eventContext,
        selectedEventId:
          prepared.command.serviceId
      }
    )) {
      reply(context, 403, {
        status: "admission_denied"
      });
      return;
    }

    const runtime = await (
      deps.runtime ?? liveRuntime
    )();

    const result =
      await submitPermanentPublicVisitRegistration(
        {
          token: input.token,
          submissionId: input.submissionId,
          body: input.body
        },
        {
          ...runtime,
          enabled: true,
          context: eventContext,
          signingSecret,
          claimSecret,
          familyEnabled: true,
          automaticFollowupEnabled: true
        }
      );

    if (result.accepted) {
      reply(context, 200, {
        status: "recorded",
        accepted: true
      });
      return;
    }

    const statuses = {
      invalid: 400,
      selection_required: 409,
      admission_denied: 403,
      submission_conflict: 409,
      capacity_exhausted: 429,
      requires_staff_review: 409,
      unavailable: 503,
      try_later: 503
    } as const;

    // Never return visitor identity, family details,
    // storage exceptions or backend credentials.
    reply(context, statuses[result.status], {
      status: result.status,
      accepted: false
    });
  } catch {
    reply(context, 503, {
      status: "try_later",
      accepted: false
    });
  }
}
