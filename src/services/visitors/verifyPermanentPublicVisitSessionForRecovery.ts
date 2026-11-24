import {
  verifyPermanentPublicVisitSession,
  type VerifiedPermanentPublicVisitSession
} from "./permanentPublicVisitSession";

import {
  resolvePermanentPublicVisitEvent,
  type PermanentPublicVisitContext
} from "./resolvePermanentPublicVisitEvent";

const RECOVERY_WINDOW_SECONDS = 7200;

/**
 * Internal submission recovery verification only.
 *
 * An expired session may identify its original durable
 * reservation, but it cannot authorize a new reservation.
 *
 * The reservation service MUST independently enforce
 * resume-only behavior for expired credentials.
 *
 * Do not use this verifier for issuing new sessions
 * or for general public authorization.
 */
export function verifyPermanentPublicVisitSessionForRecovery(
  token: unknown,
  secret: unknown,
  context: PermanentPublicVisitContext
): VerifiedPermanentPublicVisitSession | null {
  try {
    const current =
      verifyPermanentPublicVisitSession(
        token, secret, context
      );

    if (current) {
      return current;
    }

    if (context.enabled !== true ||
        !Number.isSafeInteger(context.nowMs) ||
        context.nowMs < 0 ||
        typeof token !== "string" ||
        token.length > 4096) {
      return null;
    }

    const parts = token.split(".");

    if (parts.length !== 3 ||
        parts[0] !== "p1" ||
        !/^[A-Za-z0-9_-]+$/.test(parts[1])) {
      return null;
    }

    // Unverified expiration is used only to select
    // a historical verification instant. It is never
    // treated as authenticated session authority.
    const payload: unknown = JSON.parse(
      Buffer.from(
        parts[1], "base64url"
      ).toString("utf8")
    );

    if (!payload ||
        typeof payload !== "object" ||
        Array.isArray(payload)) {
      return null;
    }

    const exp = (
      payload as Record<string, unknown>
    ).exp;

    if (typeof exp !== "number" ||
        !Number.isSafeInteger(exp) ||
        exp <= 0) {
      return null;
    }

    const nowSeconds =
      Math.floor(context.nowMs / 1000);

    const elapsed = nowSeconds - exp;

    if (elapsed < 0 ||
        elapsed > RECOVERY_WINDOW_SECONDS) {
      return null;
    }

    const historicalNowMs =
      (exp - 1) * 1000;

    if (!Number.isSafeInteger(historicalNowMs)) {
      return null;
    }

    // Reuse the original strict cryptographic verifier.
    // It checks signature, purpose, canonical encoding,
    // claims, lifetime and trusted event selection.
    const historical =
      verifyPermanentPublicVisitSession(
        token,
        secret,
        {
          ...context,
          nowMs: historicalNowMs
        }
      );

    if (!historical ||
        historical.expiresAtSeconds !== exp) {
      return null;
    }

    const event =
      resolvePermanentPublicVisitEvent(context);

    // Preserve the current trusted event boundary.
    // Recovery never crosses the Eastern calendar date
    // or silently switches a submission to another event.
    if (event.status !== "ready" ||
        event.serviceId !== historical.serviceId ||
        event.date !== historical.date) {
      return null;
    }

    return historical;
  } catch {
    return null;
  }
}
