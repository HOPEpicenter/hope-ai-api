import {
  modelOAuthRevocationOrdering,
  type OAuthOrderingCommand,
  type OAuthOrderingSnapshot
} from "./modelOAuthRevocationOrdering";

import {
  isOAuthOrderingReceiptEnvelope
} from "./modelOAuthOrderingTransitionReceipts";

/**
 * Synthetic V2 receipt-history inspection.
 *
 * The observed envelope must come from trusted storage
 * before its contents can be treated as storage evidence.
 *
 * This pure evaluator cannot authenticate a worker,
 * authorize execution, retry a write or mutate storage.
 */
export type OAuthReceiptReconciliationStatus =
  | "recorded"
  | "absent_unproven"
  | "conflicting_evidence"
  | "unresolved";

export interface OAuthReceiptReconciliationResult {
  readonly status: OAuthReceiptReconciliationStatus;
  readonly retryPermitted: false;
  readonly executionPermitted: false;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function record(
  value: unknown
): value is Record<string, unknown> {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
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

function validCommandShape(value: unknown): boolean {
  if (!record(value)) return false;

  if (
    value.kind === "claim" ||
    value.kind === "complete" ||
    value.kind === "mark_uncertain"
  ) {
    return exactKeys(value, [
      "kind", "expectedRevision", "claimId"
    ]);
  }

  if (value.kind === "revoke") {
    return exactKeys(value, [
      "kind", "expectedRevision", "source"
    ]);
  }

  return false;
}

function sameSnapshot(
  left: OAuthOrderingSnapshot,
  right: OAuthOrderingSnapshot
): boolean {
  return left.revision === right.revision &&
    left.state === right.state &&
    left.claimId === right.claimId &&
    left.revocationSource === right.revocationSource;
}

function sameCommand(
  left: OAuthOrderingCommand,
  right: OAuthOrderingCommand
): boolean {
  if (
    left.kind !== right.kind ||
    left.expectedRevision !== right.expectedRevision
  ) {
    return false;
  }

  if (left.kind === "revoke") {
    return right.kind === "revoke" &&
      left.source === right.source;
  }

  return right.kind !== "revoke" &&
    left.claimId === right.claimId;
}

function result(
  status: OAuthReceiptReconciliationStatus
): OAuthReceiptReconciliationResult {
  return Object.freeze({
    status,
    retryPermitted: false,
    executionPermitted: false
  });
}

/**
 * A matching attempt is "recorded" only if:
 * - the entire V2 history passes chain validation;
 * - the supplied before-state permits the requested command;
 * - the receipt matches the exact attempt, command,
 *   revisions and resulting snapshot.
 *
 * This does not prove who supplied the attempt identifier.
 *
 * Absence is never proof that a potentially in-flight
 * write cannot later commit.
 */
export function inspectOAuthOrderingReceiptReconciliation(
  coordinationId: unknown,
  attemptId: unknown,
  before: unknown,
  command: unknown,
  observedEnvelope: unknown
): OAuthReceiptReconciliationResult {
  if (
    typeof coordinationId !== "string" ||
    !UUID.test(coordinationId) ||
    typeof attemptId !== "string" ||
    !UUID.test(attemptId) ||
    !validCommandShape(command) ||
    !isOAuthOrderingReceiptEnvelope(observedEnvelope)
  ) {
    return result("unresolved");
  }

  const expected = modelOAuthRevocationOrdering(
    before,
    command
  );

  if (!expected.accepted) {
    return result("unresolved");
  }

  const receipt = observedEnvelope.receipts.find(
    item => item.attemptId === attemptId
  );

  if (!receipt) {
    return result("absent_unproven");
  }

  if (
    receipt.fromRevision !==
      (before as OAuthOrderingSnapshot).revision ||
    receipt.toRevision !== expected.next.revision ||
    !sameCommand(
      receipt.command,
      command as OAuthOrderingCommand
    ) ||
    !sameSnapshot(receipt.next, expected.next)
  ) {
    return result("conflicting_evidence");
  }

  return result("recorded");
}
