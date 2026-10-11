import {
  initialOAuthOrderingSnapshot,
  modelOAuthRevocationOrdering,
  type OAuthOrderingCommand,
  type OAuthOrderingSnapshot
} from "./modelOAuthRevocationOrdering";

/**
 * Synthetic receipt-bearing ordering contract, version 2.
 *
 * This is NOT a storage transaction or execution authority.
 * The eventual repository must conditionally Replace the
 * entire envelope (snapshot + receipts) in one entity.
 *
 * No receipt may grant OAuth execution or automatic retry.
 */
export const OAUTH_ORDERING_RECEIPT_SCHEMA_VERSION = 2;
export const MAX_OAUTH_ORDERING_RECEIPTS = 32;

export interface OAuthOrderingTransitionReceipt {
  readonly attemptId: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly command: OAuthOrderingCommand;
  readonly next: OAuthOrderingSnapshot;
}

export interface OAuthOrderingReceiptEnvelope {
  readonly schemaVersion: 2;
  readonly snapshot: OAuthOrderingSnapshot;
  readonly receipts: readonly OAuthOrderingTransitionReceipt[];
}

export type OAuthOrderingReceiptDecision =
  | {
      readonly accepted: true;
      readonly next: OAuthOrderingReceiptEnvelope;
      readonly retryPermitted: false;
      readonly executionPermitted: false;
    }
  | {
      readonly accepted: false;
      readonly reason:
        | "invalid_evidence"
        | "duplicate_attempt"
        | "history_full"
        | "transition_denied";
      readonly retryPermitted: false;
      readonly executionPermitted: false;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function record(value: unknown): value is Record<string, unknown> {
  return !!value &&
    typeof value === "object" &&
    !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean {
  const keys = Object.keys(value);
  return keys.length === expected.length &&
    expected.every(key =>
      Object.prototype.hasOwnProperty.call(value, key)
    );
}

function sameSnapshot(
  left: OAuthOrderingSnapshot,
  right: unknown
): boolean {
  if (!record(right) ||
      !exactKeys(right, [
        "revision", "state", "claimId", "revocationSource"
      ])) {
    return false;
  }

  return left.revision === right.revision &&
    left.state === right.state &&
    left.claimId === right.claimId &&
    left.revocationSource === right.revocationSource;
}

function validCommandShape(value: unknown): boolean {
  if (!record(value) || typeof value.kind !== "string") {
    return false;
  }

  if (value.kind === "claim" ||
      value.kind === "complete" ||
      value.kind === "mark_uncertain") {
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

function deny(
  reason:
    | "invalid_evidence"
    | "duplicate_attempt"
    | "history_full"
    | "transition_denied"
): OAuthOrderingReceiptDecision {
  return {
    accepted: false,
    reason,
    retryPermitted: false,
    executionPermitted: false
  };
}

/**
 * Historical receipts must form one valid, gap-free chain
 * starting at the canonical initial snapshot.
 *
 * The chain protects internal consistency, not authenticity.
 * Storage authenticity still depends on trusted infrastructure.
 */
export function isOAuthOrderingReceiptEnvelope(
  value: unknown
): value is OAuthOrderingReceiptEnvelope {
  if (!record(value) ||
      !exactKeys(value, [
        "schemaVersion", "snapshot", "receipts"
      ]) ||
      value.schemaVersion !==
        OAUTH_ORDERING_RECEIPT_SCHEMA_VERSION ||
      !Array.isArray(value.receipts) ||
      value.receipts.length > MAX_OAUTH_ORDERING_RECEIPTS) {
    return false;
  }

  let current = initialOAuthOrderingSnapshot();
  const attempts = new Set<string>();

  for (const item of value.receipts) {
    if (!record(item) ||
        !exactKeys(item, [
          "attemptId",
          "fromRevision",
          "toRevision",
          "command",
          "next"
        ]) ||
        typeof item.attemptId !== "string" ||
        !UUID.test(item.attemptId) ||
        attempts.has(item.attemptId) ||
        item.fromRevision !== current.revision ||
        !validCommandShape(item.command)) {
      return false;
    }

    const modeled = modelOAuthRevocationOrdering(
      current,
      item.command
    );

    if (!modeled.accepted ||
        item.toRevision !== modeled.next.revision ||
        !sameSnapshot(modeled.next, item.next)) {
      return false;
    }

    attempts.add(item.attemptId);
    current = modeled.next;
  }

  return sameSnapshot(current, value.snapshot);
}

export function initialOAuthOrderingReceiptEnvelope():
  OAuthOrderingReceiptEnvelope {
  return Object.freeze({
    schemaVersion: 2 as const,
    snapshot: initialOAuthOrderingSnapshot(),
    receipts: Object.freeze([])
  });
}

/**
 * Construct an immutable next-state candidate.
 *
 * A repository may write this candidate only by conditional
 * Replace of the SAME entity and the ETag that was read.
 *
 * Never split the snapshot and receipt into two writes.
 */
export function modelOAuthOrderingReceiptTransition(
  current: unknown,
  attemptId: unknown,
  command: unknown
): OAuthOrderingReceiptDecision {
  if (!isOAuthOrderingReceiptEnvelope(current) ||
      typeof attemptId !== "string" ||
      !UUID.test(attemptId) ||
      !validCommandShape(command)) {
    return deny("invalid_evidence");
  }

  if (current.receipts.some(
    receipt => receipt.attemptId === attemptId
  )) {
    return deny("duplicate_attempt");
  }

  if (current.receipts.length >= MAX_OAUTH_ORDERING_RECEIPTS) {
    return deny("history_full");
  }

  const modeled = modelOAuthRevocationOrdering(
    current.snapshot,
    command
  );

  if (!modeled.accepted) {
    return deny("transition_denied");
  }

  const receipt: OAuthOrderingTransitionReceipt =
    Object.freeze({
      attemptId,
      fromRevision: current.snapshot.revision,
      toRevision: modeled.next.revision,
      command: Object.freeze({
        ...(command as OAuthOrderingCommand)
      }) as OAuthOrderingCommand,
      next: modeled.next
    });

  const next: OAuthOrderingReceiptEnvelope =
    Object.freeze({
      schemaVersion: 2 as const,
      snapshot: modeled.next,
      receipts: Object.freeze([
        ...current.receipts,
        receipt
      ])
    });

  if (!isOAuthOrderingReceiptEnvelope(next)) {
    return deny("invalid_evidence");
  }

  return {
    accepted: true,
    next,
    retryPermitted: false,
    executionPermitted: false
  };
}
