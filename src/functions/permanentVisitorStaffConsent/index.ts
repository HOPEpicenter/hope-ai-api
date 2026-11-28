import {
  requireAdminStaffActorForFunction
} from "../_shared/adminStaffActor";

import { getTableClient } from "../_shared/tableClient";

import {
  createPermanentVisitorConsentRepository
} from "../../repositories/permanentVisitorConsentRepository";

type Dependencies = {
  readStaff?: Parameters<
    typeof requireAdminStaffActorForFunction
  >[1];
  repository?: Pick<
    ReturnType<typeof createPermanentVisitorConsentRepository>,
    "read" | "apply"
  >;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

/**
 * Administrator-only consent review and decision.
 * No contact execution, enrollment, identity matching,
 * visitor creation or release of writer protections.
 */
export async function permanentVisitorStaffConsent(
  context: any,
  req: any,
  deps: Dependencies = {}
): Promise<void> {
  const reply = (
    status: number,
    body: Record<string, unknown>
  ) => {
    context.res = {
      status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      },
      body
    };
  };

  const unavailable = () => reply(503, {
    ok: false,
    error: "STAFF_CONSENT_UNAVAILABLE"
  });

  if (
    process.env.FEATURE_PERMANENT_VISITOR_STAFF_CONSENT_DECISION
      !== "true"
  ) {
    reply(404, { ok: false, error: "NOT_FOUND" });
    return;
  }

  if (
    process.env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY
      !== "true"
  ) {
    unavailable();
    return;
  }

  try {
    const cutover =
      process.env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER;

    if (!cutover ||
        !Number.isFinite(Date.parse(cutover)) ||
        new Date(cutover).toISOString() !== cutover) {
      unavailable();
      return;
    }

    const adminKey =
      (process.env.HOPE_ADMIN_API_KEY ?? "").trim();

    if (!adminKey || [
      process.env.HOPE_API_KEY,
      process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY,
      process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET,
      process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET
    ].some(key => key?.trim() === adminKey)) {
      unavailable();
      return;
    }

    const auth = await requireAdminStaffActorForFunction(
      req, deps.readStaff
    );

    if (!auth.ok) {
      reply(auth.status, {
        ok: false,
        error: "STAFF_CONSENT_ADMIN_REQUIRED"
      });
      return;
    }

    const visitorId: unknown = req?.params?.visitorId;

    if (!validId(visitorId)) {
      reply(400, {
        ok: false,
        error: "INVALID_VISITOR_REFERENCE"
      });
      return;
    }

    const repository = deps.repository ??
      createPermanentVisitorConsentRepository(
        getTableClient("VisitorFollowupEvents"), true
      );

    if (req?.method === "GET") {
      const current = await repository.read(visitorId);

      if (current.status === "not_initialized") {
        reply(409, {
          ok: false,
          error: "CONSENT_NOT_INITIALIZED"
        });
        return;
      }

      if (current.status !== "ready") {
        unavailable();
        return;
      }

      reply(200, {
        ok: true,
        visitorId,
        revision: current.state.revision,
        effective: current.state.effective,
        pending: current.state.pending
      });

      return;
    }

    if (req?.method !== "POST") {
      reply(405, {
        ok: false,
        error: "METHOD_NOT_ALLOWED"
      });
      return;
    }

    const body: unknown = req?.body;

    if (!body ||
        typeof body !== "object" ||
        Object.getPrototypeOf(body) !== Object.prototype) {
      reply(400, {
        ok: false,
        error: "INVALID_CONSENT_DECISION"
      });
      return;
    }

    const value = body as Record<string, unknown>;

    const keys = [
      "expectedRevision",
      "decisionId",
      "pendingRequestId",
      "decision",
      "confirmation"
    ];

    if (Object.keys(value).length !== keys.length ||
        !keys.every(key =>
          Object.prototype.hasOwnProperty.call(value, key)
        ) ||
        typeof value.expectedRevision !== "number" ||
        !Number.isSafeInteger(value.expectedRevision) ||
        value.expectedRevision < 1 ||
        !validId(value.decisionId) ||
        (value.pendingRequestId !== null && !validId(value.pendingRequestId)) ||
        (value.decision !== "granted" &&
         value.decision !== "declined") ||
        value.confirmation !== "visitor_choice_verified") {
      reply(400, {
        ok: false,
        error: "EXACT_VERIFIED_DECISION_REQUIRED"
      });
      return;
    }

    // The authenticated administrator attests to having
    // independently verified the visitor's actual choice.
    // Never accept a caller-supplied Staff actor.
    const result = await repository.apply(visitorId, {
      kind: "verified_staff_decision",
      expectedRevision: value.expectedRevision,
      decisionId: value.decisionId,
      pendingRequestId: value.pendingRequestId,
      actorId: auth.actorId,
      decision: value.decision
    });

    if (result.status === "rejected") {
      if (result.reason === "unavailable") {
        unavailable();
        return;
      }

      reply(409, {
        ok: false,
        error: "CONSENT_DECISION_CONFLICT"
      });
      return;
    }

    // A receipt acknowledges a historical operation.
    // It does not assert current contact permission.
    reply(200, {
      ok: true,
      decisionId: value.decisionId,
      status: result.status,
      recordedRevision: result.revision
    });

  } catch {
    unavailable();
  }
}
