/**
 * Pure synthetic OAuth revocation-ordering model.
 *
 * This is NOT a lock, storage repository, authorization
 * decision, executor or production revocation handler.
 *
 * A real implementation must atomically persist transitions
 * and enlist every applicable staff/session/credential writer.
 * No model result permits external execution.
 */

export type OAuthOrderingState =
  | "idle"
  | "claimed"
  | "revocation_pending"
  | "revoked"
  | "completed"
  | "uncertain";

export type OAuthRevocationSource =
  | "staff_deactivation"
  | "entra_binding_change"
  | "session_revocation"
  | "credential_revocation"
  | "credential_rotation";

export interface OAuthOrderingSnapshot {
  readonly revision: number;
  readonly state: OAuthOrderingState;
  readonly claimId: string | null;
  readonly revocationSource: OAuthRevocationSource | null;
}

export type OAuthOrderingCommand =
  | {
      kind: "claim";
      expectedRevision: number;
      claimId: string;
    }
  | {
      kind: "revoke";
      expectedRevision: number;
      source: OAuthRevocationSource;
    }
  | {
      kind: "complete";
      expectedRevision: number;
      claimId: string;
    }
  | {
      kind: "mark_uncertain";
      expectedRevision: number;
      claimId: string;
    };

export type OAuthOrderingResult =
  | {
      accepted: true;
      next: OAuthOrderingSnapshot;
      executionPermitted: false;
    }
  | {
      accepted: false;
      reason: "stale_or_invalid" | "transition_denied";
      executionPermitted: false;
    };

export function initialOAuthOrderingSnapshot():
  OAuthOrderingSnapshot {
  return Object.freeze({
    revision: 0,
    state: "idle" as const,
    claimId: null,
    revocationSource: null
  });
}

const SOURCES: readonly OAuthRevocationSource[] = [
  "staff_deactivation",
  "entra_binding_change",
  "session_revocation",
  "credential_revocation",
  "credential_rotation"
];

function safeRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value < Number.MAX_SAFE_INTEGER;
}

function validId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !/[\r\n]/.test(value);
}

function isSnapshot(
  value: unknown
): value is OAuthOrderingSnapshot {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return false;

  const v = value as Record<string, unknown>;

  if (!safeRevision(v.revision)) return false;

  if (v.state === "idle") {
    return v.claimId === null &&
      v.revocationSource === null;
  }

  if (v.state === "revoked") {
    return v.claimId === null &&
      SOURCES.includes(v.revocationSource as OAuthRevocationSource);
  }

  if (v.state === "claimed" || v.state === "completed") {
    return validId(v.claimId) &&
      v.revocationSource === null;
  }

  if (v.state === "revocation_pending") {
    return validId(v.claimId) &&
      SOURCES.includes(v.revocationSource as OAuthRevocationSource);
  }

  if (v.state === "uncertain") {
    return validId(v.claimId) &&
      (v.revocationSource === null ||
       SOURCES.includes(v.revocationSource as OAuthRevocationSource));
  }

  return false;
}

function deny(
  reason: "stale_or_invalid" | "transition_denied"
): OAuthOrderingResult {
  return { accepted: false, reason, executionPermitted: false };
}

function accept(
  current: OAuthOrderingSnapshot,
  state: OAuthOrderingState,
  claimId: string | null,
  revocationSource: OAuthRevocationSource | null
): OAuthOrderingResult {
  return {
    accepted: true,
    executionPermitted: false,
    next: Object.freeze({
      revision: current.revision + 1,
      state,
      claimId,
      revocationSource
    })
  };
}

/**
 * Compare-and-swap transition specification.
 *
 * The expectedRevision comparison models an atomic commit
 * predicate; it does not implement one. Calling this
 * function concurrently is NOT a storage transaction.
 *
 * Claimed-before-revoked never means external work is safe.
 * Pending and uncertain states block subsequent claims.
 * This model has no automatic expiry/recovery mechanism.
 */
export function modelOAuthRevocationOrdering(
  current: unknown,
  command: unknown
): OAuthOrderingResult {
  if (!isSnapshot(current) ||
      !command || typeof command !== "object" ||
      Array.isArray(command)) {
    return deny("stale_or_invalid");
  }

  const c = command as Record<string, unknown>;

  if (!safeRevision(c.expectedRevision) ||
      c.expectedRevision !== current.revision) {
    return deny("stale_or_invalid");
  }

  if (c.kind === "claim") {
    if (!validId(c.claimId) || current.state !== "idle") {
      return deny("transition_denied");
    }
    return accept(current, "claimed", c.claimId, null);
  }

  if (c.kind === "revoke") {
    if (
      typeof c.source !== "string" ||
      !SOURCES.includes(c.source as OAuthRevocationSource)
    ) {
      return deny("transition_denied");
    }

    const source = c.source as OAuthRevocationSource;

    if (current.state === "idle" ||
        current.state === "completed") {
      return accept(current, "revoked", null, source);
    }

    if (current.state === "claimed") {
      return accept(
        current, "revocation_pending", current.claimId, source
      );
    }

    // Never overwrite unresolved revocation evidence.
    return deny("transition_denied");
  }

  if (c.kind === "complete") {
    if (!validId(c.claimId) ||
        current.claimId !== c.claimId ||
        current.state !== "claimed") {
      return deny("transition_denied");
    }
    return accept(current, "completed", current.claimId, null);
  }

  if (c.kind === "mark_uncertain") {
    if (!validId(c.claimId) ||
        current.claimId !== c.claimId ||
        (current.state !== "claimed" &&
         current.state !== "revocation_pending")) {
      return deny("transition_denied");
    }
    return accept(
      current, "uncertain", current.claimId,
      current.revocationSource
    );
  }

  return deny("transition_denied");
}
