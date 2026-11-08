import {
  modelTokenCustodyTransition,
  type TokenCustodyCommand,
  type TokenCustodySnapshot,
} from "./modelTokenCustodyTransition";

import {
  TOKEN_CUSTODY_PARTITION_KEY,
} from "../../repositories/tokenCustodyMetadataRepository";

/**
 * Synthetic-only, same-partition transaction proposal.
 *
 * This module does not authorize operations, access credentials,
 * perform storage writes, acquire fences, or permit execution.
 *
 * A future trusted adapter must validate authorization,
 * implement one actual atomic Table transaction and independently
 * resolve any uncertain acknowledgement before proceeding.
 */
export type CustodyAtomicReceiptAction =
  | Readonly<{
      kind: "update";
      partitionKey: string;
      rowKey: string;
      snapshotJson: string;
      etag: string;
      mode: "Replace";
    }>
  | Readonly<{
      kind: "create";
      partitionKey: string;
      rowKey: string;
      receiptJson: string;
    }>;

export type CustodyAtomicReceiptPlan =
  | Readonly<{
      outcome: "denied";
      executionPermitted: false;
      retryPermitted: false;
    }>
  | Readonly<{
      outcome: "proposed";
      actions: readonly [
        CustodyAtomicReceiptAction,
        CustodyAtomicReceiptAction
      ];
      executionPermitted: false;
      retryPermitted: false;
    }>;

export type CustodyAtomicReceiptInput = Readonly<{
  recordId: string;
  etag: string;
  receiptId: string;
  snapshot: TokenCustodySnapshot;
  command: TokenCustodyCommand;
}>;

const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;
const RECEIPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function denied(): CustodyAtomicReceiptPlan {
  return {
    outcome: "denied",
    executionPermitted: false,
    retryPermitted: false,
  };
}

export function planTokenCustodyAtomicReceipt(
  input: CustodyAtomicReceiptInput,
): CustodyAtomicReceiptPlan {
  if (!input || typeof input !== "object" ||
      Array.isArray(input) ||
      Object.keys(input).length !== 5 ||
      !Object.keys(input).every(key =>
        ["recordId", "etag", "receiptId", "snapshot", "command"]
          .includes(key)
      ) ||
      typeof input.recordId !== "string" ||
      !RECORD_ID.test(input.recordId) ||
      typeof input.etag !== "string" ||
      !input.etag.trim() ||
      input.etag.trim() === "*" ||
      input.etag !== input.etag.trim() ||
      typeof input.receiptId !== "string" ||
      !RECEIPT_ID.test(input.receiptId) ||
      !input.snapshot ||
      input.snapshot.recordId !== input.recordId ||
      !input.command ||
      typeof input.command !== "object" ||
      Array.isArray(input.command)) {
    return denied();
  }

  // The two flags are synthetic preconditions, not trusted
  // runtime authorization or feature activation.
  if (input.command.authorized !== true ||
      input.command.executionEnabled !== true) {
    return denied();
  }

  const allowedCommandKeys = [
    "action",
    "expectedRevision",
    "expectedRotationRevision",
    "expectedRevocationRevision",
    "authorized",
    "executionEnabled",
    "nextAccessExpiresAtMs",
  ];

  if (!Object.keys(input.command).every(key =>
    allowedCommandKeys.includes(key)
  )) {
    return denied();
  }

  const transition = modelTokenCustodyTransition(
    input.snapshot,
    input.command,
  );

  if (transition.outcome !== "proposed") {
    return denied();
  }

  const next = transition.next;

  // Only explicitly approved metadata fields enter storage.
  const nextSnapshot: TokenCustodySnapshot = {
    recordId: next.recordId,
    revision: next.revision,
    rotationRevision: next.rotationRevision,
    revocationRevision: next.revocationRevision,
    state: next.state,
    accessExpiresAtMs: next.accessExpiresAtMs,
  };

  const receipt = {
    schemaVersion: 1,
    receiptId: input.receiptId,
    recordId: input.recordId,
    action: input.command.action,
    previousRevision: input.snapshot.revision,
    nextRevision: nextSnapshot.revision,
  };

  const partitionKey = TOKEN_CUSTODY_PARTITION_KEY;

  return {
    outcome: "proposed",
    actions: [
      {
        kind: "update",
        partitionKey,
        rowKey: input.recordId,
        snapshotJson: JSON.stringify(nextSnapshot),
        etag: input.etag,
        mode: "Replace",
      },
      {
        kind: "create",
        partitionKey,
        rowKey: `audit-${input.receiptId}`,
        receiptJson: JSON.stringify(receipt),
      },
    ],
    executionPermitted: false,
    retryPermitted: false,
  };
}
