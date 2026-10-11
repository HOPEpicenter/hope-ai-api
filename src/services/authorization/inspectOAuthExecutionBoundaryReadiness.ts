import {
  isOAuthCredentialMetadataV1
} from "../../contracts/oauthCredentialStorage.v1";

import {
  isOAuthSessionCurrentlyActiveV1
} from "../../contracts/oauthAuthoritativeSession.v1";

/**
 * Internal server-only expected evidence. Never populate this
 * object from a request body or reuse an old authorized boolean.
 */
export interface OAuthExecutionExpectedEvidence {
  tenantId: string;
  objectId: string;
  staffId: string;
  sessionBindingId: string;
  credentialId: string;
  expectedSessionRevision: number;
  expectedCredentialRevision: number;
}

/**
 * Readers must be authoritative, uncached and return all matching
 * records. The calling infrastructure establishes their trust.
 */
export interface OAuthExecutionReadinessDependencies {
  readStaffDirectory: () => Promise<readonly unknown[]>;
  readSessions: (id: string) => Promise<readonly unknown[]>;
  readCredentials: (id: string) => Promise<readonly unknown[]>;
  clock: () => number;
}

export type OAuthExecutionReadinessDecision =
  | { readyForAtomicFence: true }
  | {
      readyForAtomicFence: false;
      reason: "execution_preconditions_denied";
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function validRevision(value: unknown): boolean {
  return typeof value === "number" &&
    Number.isSafeInteger(value) && value >= 0;
}

function validStaffId(value: unknown): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    value.trim() === value &&
    !/[\r\n]/.test(value);
}

function validEvidence(value: unknown):
  value is OAuthExecutionExpectedEvidence {
  if (!value || typeof value !== "object" ||
      Array.isArray(value)) return false;

  const v = value as Record<string, unknown>;
  const keys = [
    "tenantId", "objectId", "staffId",
    "sessionBindingId", "credentialId",
    "expectedSessionRevision",
    "expectedCredentialRevision"
  ];

  return Object.keys(v).length === keys.length &&
    keys.every(key => Object.prototype.hasOwnProperty.call(v, key)) &&
    typeof v.tenantId === "string" && UUID.test(v.tenantId) &&
    typeof v.objectId === "string" && UUID.test(v.objectId) &&
    validStaffId(v.staffId) &&
    typeof v.sessionBindingId === "string" &&
    UUID.test(v.sessionBindingId) &&
    typeof v.credentialId === "string" &&
    UUID.test(v.credentialId) &&
    validRevision(v.expectedSessionRevision) &&
    validRevision(v.expectedCredentialRevision);
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" &&
    !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

/**
 * Non-executing precondition inspection.
 *
 * Even a positive result is NOT an authorization grant, durable
 * lease, transaction, or permission to read/rotate/revoke secrets.
 * It cannot prevent revocation after these reads.
 *
 * No sensitive operation may consume this decision directly.
 */
export async function inspectOAuthExecutionBoundaryReadiness(
  expected: unknown,
  dependencies: OAuthExecutionReadinessDependencies
): Promise<OAuthExecutionReadinessDecision> {
  const denied: OAuthExecutionReadinessDecision = {
    readyForAtomicFence: false,
    reason: "execution_preconditions_denied"
  };

  if (!validEvidence(expected) ||
      !dependencies ||
      typeof dependencies.readStaffDirectory !== "function" ||
      typeof dependencies.readSessions !== "function" ||
      typeof dependencies.readCredentials !== "function" ||
      typeof dependencies.clock !== "function") {
    return denied;
  }

  try {
    const staffRecords = await dependencies.readStaffDirectory();
    if (!Array.isArray(staffRecords)) return denied;

    const matches = staffRecords.filter(item => {
      const s = record(item);
      return s !== null &&
        s.entraTenantId === expected.tenantId &&
        s.entraObjectId === expected.objectId;
    });

    if (matches.length !== 1) return denied;

    const staff = record(matches[0]);
    if (!staff ||
        staff.staffId !== expected.staffId ||
        staff.status !== "active") {
      return denied;
    }

    const sessions = await dependencies.readSessions(
      expected.sessionBindingId
    );
    if (!Array.isArray(sessions) || sessions.length !== 1) {
      return denied;
    }

    const now = dependencies.clock();
    if (!Number.isSafeInteger(now) || now < 0 ||
        now > 8640000000000000) {
      return denied;
    }

    const session = sessions[0];
    if (!isOAuthSessionCurrentlyActiveV1(session, now) ||
        session.sessionBindingId !== expected.sessionBindingId ||
        session.tenantId !== expected.tenantId ||
        session.entraObjectId !== expected.objectId ||
        session.canonicalStaffId !== expected.staffId ||
        session.revision !== expected.expectedSessionRevision) {
      return denied;
    }

    const credentials = await dependencies.readCredentials(
      expected.credentialId
    );
    if (!Array.isArray(credentials) ||
        credentials.length !== 1) {
      return denied;
    }

    const credential = credentials[0];
    if (!isOAuthCredentialMetadataV1(credential) ||
        credential.credentialId !== expected.credentialId ||
        credential.status !== "active" ||
        credential.revision !== expected.expectedCredentialRevision ||
        credential.owner.tenantId !== expected.tenantId ||
        credential.owner.entraObjectId !== expected.objectId ||
        credential.owner.canonicalStaffId !== expected.staffId ||
        credential.owner.sessionBindingId !==
          expected.sessionBindingId) {
      return denied;
    }

    const finalNow = dependencies.clock();
    if (!Number.isSafeInteger(finalNow) ||
        finalNow < now ||
        finalNow >= Date.parse(session.expiresAt) ||
        finalNow >= Date.parse(credential.expiresAt)) {
      return denied;
    }

    return { readyForAtomicFence: true };
  } catch {
    return denied;
  }
}
