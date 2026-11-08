import {
  inspectOAuthExecutionBoundaryReadiness,
  type OAuthExecutionExpectedEvidence,
  type OAuthExecutionReadinessDependencies
} from "./inspectOAuthExecutionBoundaryReadiness";

import {
  TOKEN_CUSTODY_PARTITION_KEY
} from "../../repositories/tokenCustodyMetadataRepository";

import type {
  TokenCustodySnapshot
} from "./modelTokenCustodyTransition";

/**
 * Trusted server-side expected evidence only.
 * Never construct this from request-supplied snapshots or booleans.
 *
 * The credential and custody revisions have separate histories.
 * In v1, the custody row key must equal the credential ID.
 */
export interface CustodyAtomicBoundaryExpected
  extends OAuthExecutionExpectedEvidence {
  custodyRecordId: string;
  expectedCustodyRevision: number;
  expectedRotationRevision: number;
  expectedRevocationRevision: number;
}

export interface CustodyAtomicBoundaryDependencies
  extends OAuthExecutionReadinessDependencies {
  readCustodyRecords:
    (recordId: string) => Promise<readonly unknown[]>;
}

export type CustodyAtomicBoundaryDecision =
  | Readonly<{
      preconditionsObserved: true;
      executionPermitted: false;
      retryPermitted: false;
    }>
  | Readonly<{
      preconditionsObserved: false;
      reason: "custody_boundary_denied";
      executionPermitted: false;
      retryPermitted: false;
    }>;

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function revision(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value >= 0;
}

function exactKeys(
  input: unknown,
  names: readonly string[]
): input is Record<string, unknown> {
  if (!input || typeof input !== "object" ||
      Array.isArray(input)) return false;

  const keys = Object.keys(input);
  return keys.length === names.length &&
    names.every(key =>
      Object.prototype.hasOwnProperty.call(input, key)
    );
}

const EXPECTED_KEYS = [
  "tenantId", "objectId", "staffId",
  "sessionBindingId", "credentialId",
  "expectedSessionRevision", "expectedCredentialRevision",
  "custodyRecordId", "expectedCustodyRevision",
  "expectedRotationRevision", "expectedRevocationRevision"
] as const;

const SNAPSHOT_KEYS = [
  "recordId", "revision", "rotationRevision",
  "revocationRevision", "state", "accessExpiresAtMs"
] as const;

const ENTITY_KEYS = [
  "partitionKey", "rowKey", "snapshotJson", "etag"
] as const;

function validExpected(
  value: unknown
): value is CustodyAtomicBoundaryExpected {
  if (!exactKeys(value, EXPECTED_KEYS)) return false;

  return typeof value.credentialId === "string" &&
    UUID.test(value.credentialId) &&
    value.custodyRecordId === value.credentialId &&
    revision(value.expectedSessionRevision) &&
    revision(value.expectedCredentialRevision) &&
    revision(value.expectedCustodyRevision) &&
    revision(value.expectedRotationRevision) &&
    revision(value.expectedRevocationRevision);
}

function validSnapshot(
  value: unknown,
  expected: CustodyAtomicBoundaryExpected
): value is TokenCustodySnapshot {
  if (!exactKeys(value, SNAPSHOT_KEYS)) return false;

  return value.recordId === expected.custodyRecordId &&
    value.state === "active" &&
    value.revision === expected.expectedCustodyRevision &&
    value.rotationRevision === expected.expectedRotationRevision &&
    value.revocationRevision === expected.expectedRevocationRevision &&
    revision(value.revision) &&
    revision(value.rotationRevision) &&
    revision(value.revocationRevision) &&
    value.rotationRevision <= value.revision &&
    value.revocationRevision <= value.revision &&
    typeof value.accessExpiresAtMs === "number" &&
    Number.isSafeInteger(value.accessExpiresAtMs) &&
    value.accessExpiresAtMs > 0;
}

function denied(): CustodyAtomicBoundaryDecision {
  return {
    preconditionsObserved: false,
    reason: "custody_boundary_denied",
    executionPermitted: false,
    retryPermitted: false
  };
}

/**
 * Non-executing, fail-closed evidence inspection.
 *
 * A positive result is not a durable fence, authorization grant,
 * transaction, credential read, or permission to rotate/revoke.
 * Evidence can become stale immediately after the reads.
 *
 * No live SDK, storage write, secret, endpoint, or feature flag.
 */
export async function inspectCustodyAtomicBoundary(
  expected: unknown,
  dependencies: CustodyAtomicBoundaryDependencies
): Promise<CustodyAtomicBoundaryDecision> {
  if (!validExpected(expected) ||
      !dependencies ||
      typeof dependencies.readCustodyRecords !== "function") {
    return denied();
  }

  try {
    let lastObservedTime = -1;

    const guardedClock = (): number => {
      const value = dependencies.clock();
      if (!Number.isSafeInteger(value) ||
          value < 0 ||
          value > 8640000000000000 ||
          value < lastObservedTime) {
        throw new Error("Custody inspection clock invalid");
      }
      lastObservedTime = value;
      return value;
    };

    const readiness =
      await inspectOAuthExecutionBoundaryReadiness(
        {
          tenantId: expected.tenantId,
          objectId: expected.objectId,
          staffId: expected.staffId,
          sessionBindingId: expected.sessionBindingId,
          credentialId: expected.credentialId,
          expectedSessionRevision: expected.expectedSessionRevision,
          expectedCredentialRevision: expected.expectedCredentialRevision
        },
        {
          readStaffDirectory: dependencies.readStaffDirectory,
          readSessions: dependencies.readSessions,
          readCredentials: dependencies.readCredentials,
          clock: guardedClock
        }
      );

    if (!readiness.readyForAtomicFence) return denied();

    const rows = await dependencies.readCustodyRecords(
      expected.custodyRecordId
    );

    if (!Array.isArray(rows) || rows.length !== 1) {
      return denied();
    }

    const row = rows[0];

    if (!exactKeys(row, ENTITY_KEYS) ||
        row.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
        row.rowKey !== expected.custodyRecordId ||
        typeof row.etag !== "string" ||
        !row.etag.trim() ||
        row.etag.trim() === "*" ||
        row.etag !== row.etag.trim() ||
        typeof row.snapshotJson !== "string") {
      return denied();
    }

    const snapshot: unknown = JSON.parse(row.snapshotJson);

    if (!validSnapshot(snapshot, expected)) {
      return denied();
    }

    const now = guardedClock();

    if (!Number.isSafeInteger(now) ||
        now < 0 ||
        now >= (snapshot as TokenCustodySnapshot).accessExpiresAtMs) {
      return denied();
    }

    return {
      preconditionsObserved: true,
      executionPermitted: false,
      retryPermitted: false
    };
  } catch {
    return denied();
  }
}