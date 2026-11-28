/**
 * Pure, inactive consent authority foundation.
 *
 * This module does not authenticate callers, access storage,
 * create plans, cancel plans or perform communications.
 *
 * Future trusted adapters must establish profile-creation
 * ownership and Staff authorization independently.
 *
 * Durable revision checks and operation receipts must be
 * enforced atomically by the future storage boundary.
 */

export type EffectiveConsent =
  | "unknown"
  | "granted"
  | "declined";

export type PendingConsent = Readonly<{
  kind: "grant" | "withdrawal";
  requestId: string;
}>;

export type ConsentAuthority = Readonly<{
  version: 1;
  revision: number;
  effective: EffectiveConsent;
  pending: PendingConsent | null;
  evidenceId: string;
}>;

export type ConsentCommand =
  | Readonly<{
      kind: "public_request";
      expectedRevision: number;
      requestId: string;
      requestedConsent: boolean;
    }>
  | Readonly<{
      kind: "verified_staff_decision";
      expectedRevision: number;
      decisionId: string;
      pendingRequestId: string | null;
      actorId: string;
      decision: "granted" | "declined";
    }>;

export type ConsentTransition =
  | Readonly<{
      status: "applied" | "unchanged";
      state: ConsentAuthority;
    }>
  | Readonly<{
      status: "rejected";
      reason:
        | "invalid_state"
        | "invalid_command"
        | "stale_revision"
        | "pending_request_mismatch"
        | "revision_exhausted";
    }>;

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function validId(value: unknown): value is string {
  return typeof value === "string" && ID.test(value);
}

function object(
  value: unknown
): Record<string, unknown> | null {
  return value !== null &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[]
): boolean {
  return Object.keys(value).length === keys.length &&
    keys.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1;
}

export function isConsentAuthority(
  value: unknown
): value is ConsentAuthority {
  const state = object(value);

  if (!state ||
      !exactKeys(state, [
        "version", "revision", "effective",
        "pending", "evidenceId"
      ]) ||
      state.version !== 1 ||
      !validRevision(state.revision) ||
      !validId(state.evidenceId) ||
      !["unknown", "granted", "declined"].includes(
        String(state.effective)
      ) ||
      typeof state.effective !== "string") {
    return false;
  }

  if (state.pending === null) return true;

  const pending = object(state.pending);

  if (!pending ||
      !exactKeys(pending, ["kind", "requestId"]) ||
      !validId(pending.requestId) ||
      (pending.kind !== "grant" &&
       pending.kind !== "withdrawal")) {
    return false;
  }

  return !(pending.kind === "grant" &&
    state.effective === "granted");
}

/**
 * Only a future trusted adapter may establish that
 * a profile was created by this exact registration.
 *
 * New-profile consent remains self-declared.
 * Existing-profile initialization grants nothing.
 *
 * Legacy migration is deliberately outside this contract.
 */
export function initializeConsentAuthority(
  input: unknown
): ConsentAuthority | null {
  const value = object(input);

  if (!value || !validId(value.evidenceId)) {
    return null;
  }

  if (value.kind === "new_profile" &&
      exactKeys(value, [
        "kind", "evidenceId", "initialConsent"
      ]) &&
      typeof value.initialConsent === "boolean") {
    return {
      version: 1,
      revision: 1,
      effective: value.initialConsent
        ? "granted"
        : "declined",
      pending: null,
      evidenceId: value.evidenceId
    };
  }

  if (value.kind === "existing_profile" &&
      exactKeys(value, ["kind", "evidenceId"])) {
    return {
      version: 1,
      revision: 1,
      effective: "unknown",
      pending: null,
      evidenceId: value.evidenceId
    };
  }

  return null;
}

/**
 * This is an additional consent eligibility check.
 * It is not Staff or communication authorization.
 */
export function permitsContactWork(
  value: unknown
): boolean {
  return isConsentAuthority(value) &&
    value.effective === "granted" &&
    value.pending === null;
}

function rejected(
  reason: Extract<
    ConsentTransition, { status: "rejected" }
  >["reason"]
): ConsentTransition {
  return { status: "rejected", reason };
}

function changed(
  state: ConsentAuthority,
  effective: EffectiveConsent,
  pending: PendingConsent | null,
  evidenceId: string
): ConsentTransition {
  if (state.revision === Number.MAX_SAFE_INTEGER) {
    return rejected("revision_exhausted");
  }

  return {
    status: "applied",
    state: {
      version: 1,
      revision: state.revision + 1,
      effective,
      pending,
      evidenceId
    }
  };
}

export function transitionConsentAuthority(
  current: unknown,
  command: unknown
): ConsentTransition {
  if (!isConsentAuthority(current)) {
    return rejected("invalid_state");
  }

  const input = object(command);

  if (!input ||
      !validRevision(input.expectedRevision)) {
    return rejected("invalid_command");
  }

  if (input.kind === "public_request") {
    if (!exactKeys(input, [
      "kind", "expectedRevision", "requestId",
      "requestedConsent"
    ]) ||
        !validId(input.requestId) ||
        typeof input.requestedConsent !== "boolean") {
      return rejected("invalid_command");
    }
  } else if (input.kind === "verified_staff_decision") {
    if (!exactKeys(input, [
      "kind", "expectedRevision", "decisionId",
      "pendingRequestId", "actorId", "decision"
    ]) ||
        !validId(input.decisionId) ||
        (input.pendingRequestId !== null && !validId(input.pendingRequestId)) ||
        !validId(input.actorId) ||
        (input.decision !== "granted" &&
         input.decision !== "declined")) {
      return rejected("invalid_command");
    }
  } else {
    return rejected("invalid_command");
  }

  if (input.expectedRevision !== current.revision) {
    return rejected("stale_revision");
  }

  const unchanged = (): ConsentTransition => ({
    status: "unchanged",
    state: current
  });

  if (input.kind === "public_request") {
    const requestId = input.requestId as string;

    // Public requests cannot clear or replace an
    // unresolved withdrawal.
    if (current.pending?.kind === "withdrawal") {
      return unchanged();
    }

    if (input.requestedConsent === false) {
      if (current.effective === "declined" &&
          current.pending === null) {
        return unchanged();
      }

      return changed(
        current,
        current.effective,
        { kind: "withdrawal", requestId },
        requestId
      );
    }

    if (current.effective === "granted" ||
        current.pending?.kind === "grant") {
      return unchanged();
    }

    // Public Yes is only a verification request.
    return changed(
      current,
      current.effective,
      { kind: "grant", requestId },
      requestId
    );
  }

  // Trusted Staff decision classification does NOT
  // itself prove Staff identity or authorization.
  const initialStaffVerification =
    input.pendingRequestId === null &&
    current.effective === "unknown" &&
    current.pending === null &&
    current.revision === 1;

  const matchingPendingRequest =
    current.pending !== null &&
    current.pending.requestId === input.pendingRequestId;

  if (!initialStaffVerification && !matchingPendingRequest) {
    return rejected("pending_request_mismatch");
  }

  return changed(
    current,
    input.decision as "granted" | "declined",
    null,
    input.decisionId as string
  );
}
