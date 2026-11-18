import {
  getEntraStaffAuthorizationConfiguration
} from "../../config/entraStaffAuthorization";
import {
  requireAuthenticatedAdminStaffActorForFunction
} from "../_shared/authenticatedAdminStaffActor";
import {
  reconcileKioskVisitor
} from "../../services/visitors/reconcileKioskVisitor";

type Dependencies = {
  authorize?: typeof requireAuthenticatedAdminStaffActorForFunction;
  reconcile?: typeof reconcileKioskVisitor;
  readConfiguration?: typeof getEntraStaffAuthorizationConfiguration;
};

function reply(
  context: any,
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

/**
 * Administrator-only kiosk reconciliation.
 *
 * Disabled by default.
 * Requires enforced Entra administrator authorization.
 * Never accepts authorization flags from the request body.
 * Never initiates six-week follow-up.
 */
export async function postKioskVisitorReconciliation(
  context: any,
  req: any
): Promise<void> {
  return execute(context, req, {});
}

export function createKioskVisitorReconciliationHandler(
  deps: Dependencies
): (context: any, req: any) => Promise<void> {
  return (context, req) => execute(context, req, deps);
}

async function execute(
  context: any,
  req: any,
  deps: Dependencies
): Promise<void> {
  if (
    process.env.HOPE_KIOSK_RECONCILIATION_ENABLED !== "true"
  ) {
    reply(context, 404, {
      ok: false,
      error: "NOT_AVAILABLE"
    });
    return;
  }

  try {
    const configuration = (
      deps.readConfiguration ??
      getEntraStaffAuthorizationConfiguration
    )();

    // Never permit legacy authorization fallback.
    if (configuration.enforcementEnabled !== true) {
      reply(context, 403, {
        ok: false,
        error: "NOT_AUTHORIZED"
      });
      return;
    }

    const authorize =
      deps.authorize ??
      requireAuthenticatedAdminStaffActorForFunction;

    const auth = await authorize(req, configuration);

    if (!auth.ok) {
      reply(context, auth.status, {
        ok: false,
        error: "NOT_AUTHORIZED"
      });
      return;
    }

    const body = req?.body;

    if (
      !body ||
      typeof body !== "object" ||
      Array.isArray(body) ||
      Object.getPrototypeOf(body) !== Object.prototype ||
      Object.keys(body).length !== 1 ||
      typeof body.submissionId !== "string"
    ) {
      reply(context, 400, {
        ok: false,
        error: "INVALID_REQUEST"
      });
      return;
    }

    const reconcile =
      deps.reconcile ?? reconcileKioskVisitor;

    const result = await reconcile({
      submissionId: body.submissionId,
      enabled: true,
      administratorAuthorized: true
    });

    switch (result.status) {
      case "imported":
        reply(context, 200, {
          ok: true,
          status: "imported",
          visitorId: result.visitorId,
          eligibleForStaffFollowup:
            result.eligibleForStaffFollowup,
          requiresVisitHistoryReview:
            result.requiresVisitHistoryReview
        });
        return;

      case "invalid":
        reply(context, 400, {
          ok: false,
          error: "INVALID_SUBMISSION"
        });
        return;

      case "already_claimed":
        reply(context, 409, {
          ok: false,
          error: "ALREADY_PROCESSED_OR_CLAIMED"
        });
        return;

      case "manual_recovery_required":
        reply(context, 503, {
          ok: false,
          error: "MANUAL_REVIEW_REQUIRED"
        });
        return;

      default:
        reply(context, 403, {
          ok: false,
          error: "NOT_AUTHORIZED"
        });
    }
  } catch {
    reply(context, 503, {
      ok: false,
      error: "RECONCILIATION_UNAVAILABLE"
    });
  }
}
