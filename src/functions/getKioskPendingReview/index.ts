import {
  getEntraStaffAuthorizationConfiguration
} from "../../config/entraStaffAuthorization";
import {
  requireAuthenticatedAdminStaffActorForFunction
} from "../_shared/authenticatedAdminStaffActor";
import {
  listPendingKioskIntakeV1
} from "../../repositories/listPendingKioskIntakeV1";
import {
  issueKioskReviewCursorV1,
  verifyKioskReviewCursorV1,
  requireKioskReviewCursorKeyV1
} from "../../services/visitors/kioskReviewCursorV1";

type Dependencies = {
  readConfiguration?: typeof getEntraStaffAuthorizationConfiguration;
  authorizeActor?: typeof requireAuthenticatedAdminStaffActorForFunction;
  readPending?: typeof listPendingKioskIntakeV1;
};

function respond(
  context: any,
  status: number,
  body: unknown
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff"
    },
    body
  };
}

/**
 * Staff-only kiosk review.
 *
 * The runtime handler cannot accept injected dependencies
 * from an HTTP request. Injection is for synthetic tests only.
 */
export async function getKioskPendingReview(
  context: any,
  req: any
): Promise<void> {
  return execute(context, req, {});
}

export function createGetKioskPendingReviewHandler(
  dependencies: Dependencies
): (context: any, req: any) => Promise<void> {
  return (context, req) => execute(context, req, dependencies);
}

async function execute(
  context: any,
  req: any,
  dependencies: Dependencies
): Promise<void> {
  try {
    // The entire review surface is disabled by default.
    if (process.env.HOPE_KIOSK_STAFF_REVIEW_ENABLED !== "true") {
      respond(context, 404, {
        ok: false,
        error: "NOT_AVAILABLE"
      });
      return;
    }

    // The established administrator adapter falls back to
    // legacy authorization when enforcement is disabled.
    // Guest review MUST explicitly prohibit that fallback.
    const readConfiguration =
      dependencies.readConfiguration ??
      getEntraStaffAuthorizationConfiguration;

    const configuration = readConfiguration();

    if (configuration.enforcementEnabled !== true) {
      respond(context, 403, {
        ok: false,
        error: "NOT_AUTHORIZED"
      });
      return;
    }

    const authorize =
      dependencies.authorizeActor ??
      requireAuthenticatedAdminStaffActorForFunction;

    const auth = await authorize(req, configuration);

    if (!auth.ok) {
      respond(context, auth.status, {
        ok: false,
        error: "NOT_AUTHORIZED"
      });
      return;
    }

    // Never allow an unbounded response.
    const rawLimit = req?.query?.limit;
    let limit = 25;

    if (rawLimit !== undefined) {
      if (
        typeof rawLimit !== "string" ||
        !/^[1-9][0-9]?$/.test(rawLimit)
      ) {
        respond(context, 400, {
          ok: false,
          error: "INVALID_LIMIT"
        });
        return;
      }

      limit = Number(rawLimit);

      if (limit > 25) {
        respond(context, 400, {
          ok: false,
          error: "INVALID_LIMIT"
        });
        return;
      }
    }

    // Authorization has already succeeded. Validate trusted
    // cryptographic configuration before accessing guest storage.
    const secret =
      process.env.HOPE_KIOSK_REVIEW_CURSOR_KEY ?? "";

    requireKioskReviewCursorKeyV1(secret);

    const rawCursor = req?.query?.cursor;
    let continuationToken: string | undefined;

    if (rawCursor !== undefined) {
      if (
        typeof rawCursor !== "string" ||
        rawCursor.length < 1 ||
        rawCursor.length > 8192
      ) {
        respond(context, 400, {
          ok: false,
          error: "INVALID_CURSOR"
        });
        return;
      }

      try {
        continuationToken = verifyKioskReviewCursorV1({
          cursor: rawCursor,
          actorId: auth.actorId,
          limit,
          secret
        });
      } catch {
        respond(context, 400, {
          ok: false,
          error: "INVALID_CURSOR"
        });
        return;
      }
    }

    const readPending =
      dependencies.readPending ??
      listPendingKioskIntakeV1;

    const result = await readPending({
      enabled: true,
      authorized: true,
      limit,
      continuationToken
    });

    const storageNext = result.nextContinuationToken;

    if (
      result.hasMore !== (typeof storageNext === "string")
    ) {
      throw new Error("INVALID_KIOSK_REVIEW_PAGE_STATE");
    }

    const nextCursor =
      storageNext === null
        ? null
        : issueKioskReviewCursorV1({
            continuationToken: storageNext,
            actorId: auth.actorId,
            limit,
            secret
          });

    // Only encrypted cursors may cross the HTTP boundary.
    // Never spread raw repository objects into responses.
    respond(context, 200, {
      ok: true,
      event: result.event,
      items: result.items,
      limit: result.limit,
      hasMore: result.hasMore,
      nextCursor
    });
  } catch {
    // Do not return credentials, guest details,
    // environment settings or storage exception text.
    respond(context, 503, {
      ok: false,
      error: "REVIEW_UNAVAILABLE"
    });
  }
}