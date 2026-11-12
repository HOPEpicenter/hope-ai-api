import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";

export const ENTRA_STAFF_ACCEPTANCE_OPERATION =
  "phase-c.staff-binding.acceptance" as const;

const MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;

export type TrustedEntraStaffAcceptanceEvidence = Readonly<{
  verifiedIdentity: Readonly<{
    staffId: string;
    tenantId: string;
    objectId: string;
  }>;
  canonicalStaff: Readonly<{
    staffId: string;
    status: string;
    entraTenantId: string;
    entraObjectId: string;
  }>;
  administratorAuthorized: boolean;
  verifiedAt: number;
}>;

export type TrustedEntraStaffAcceptanceBoundary = Readonly<{
  resolveAuthorizedEvidence: () =>
    Promise<TrustedEntraStaffAcceptanceEvidence | null>;
}>;

export type EntraStaffAcceptanceHandoffResult =
  | Readonly<{
      status: "issued";
      receipt: object;
    }>
  | Readonly<{
      status: "authorized";
    }>
  | Readonly<{
      status:
        | "disabled"
        | "denied"
        | "expired"
        | "invalid_receipt"
        | "operation_mismatch"
        | "boundary_unavailable";
    }>;

type HandoffState = {
  operation: typeof ENTRA_STAFF_ACCEPTANCE_OPERATION;
  identityKey: string;
  expiresAt: number;
};

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownData(value: object, key: string | symbol): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function exactKeys(value: object, keys: readonly (string | symbol)[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    keys.every(key => actual.includes(key));
}

function trustedIdentityKey(
  evidence: TrustedEntraStaffAcceptanceEvidence,
  now: number
): { identityKey: string; verifiedAt: number } | "expired" | null {
  try {
    if (
      !isRecord(evidence) ||
      !exactKeys(evidence, [
        "verifiedIdentity",
        "canonicalStaff",
        "administratorAuthorized",
        "verifiedAt"
      ])
    ) {
      return null;
    }

    const verifiedIdentity = ownData(evidence, "verifiedIdentity");
    const canonicalStaff = ownData(evidence, "canonicalStaff");
    const administratorAuthorized = ownData(
      evidence,
      "administratorAuthorized"
    );
    const verifiedAt = ownData(evidence, "verifiedAt");

    if (
      !isRecord(verifiedIdentity) ||
      !exactKeys(verifiedIdentity, ["staffId", "tenantId", "objectId"]) ||
      !isRecord(canonicalStaff) ||
      !exactKeys(canonicalStaff, [
        "staffId",
        "status",
        "entraTenantId",
        "entraObjectId"
      ])
    ) {
      return null;
    }

    const verifiedStaffId = ownData(verifiedIdentity, "staffId");
    const verifiedTenantId = ownData(verifiedIdentity, "tenantId");
    const verifiedObjectId = ownData(verifiedIdentity, "objectId");
    const canonicalStaffId = ownData(canonicalStaff, "staffId");
    const canonicalStatus = ownData(canonicalStaff, "status");
    const canonicalTenantId = ownData(canonicalStaff, "entraTenantId");
    const canonicalObjectId = ownData(canonicalStaff, "entraObjectId");

    if (
      typeof verifiedStaffId !== "string" ||
      verifiedStaffId.trim() === "" ||
      verifiedStaffId !== canonicalStaffId ||
      canonicalStatus !== "active" ||
      administratorAuthorized !== true ||
      typeof verifiedAt !== "number" ||
      !Number.isSafeInteger(verifiedAt) ||
      !Number.isSafeInteger(now)
    ) {
      return null;
    }

    if (verifiedAt > now) {
      return null;
    }
    if (now - verifiedAt > MAX_EVIDENCE_AGE_MS) {
      return "expired";
    }

    const verifiedBinding = normalizeEntraStaffBinding(
      verifiedTenantId,
      verifiedObjectId
    );
    const canonicalBinding = normalizeEntraStaffBinding(
      canonicalTenantId,
      canonicalObjectId
    );

    if (
      !verifiedBinding ||
      !canonicalBinding ||
      verifiedBinding.entraTenantId !== canonicalBinding.entraTenantId ||
      verifiedBinding.entraObjectId !== canonicalBinding.entraObjectId
    ) {
      return null;
    }

    return {
      identityKey: JSON.stringify([
        verifiedStaffId,
        verifiedBinding.entraTenantId,
        verifiedBinding.entraObjectId
      ]),
      verifiedAt
    };
  } catch {
    return null;
  }
}

function denied(
  status: Exclude<
    EntraStaffAcceptanceHandoffResult["status"],
    "issued" | "authorized"
  >
): EntraStaffAcceptanceHandoffResult {
  return Object.freeze({ status });
}

/**
 * An offline-testable one-time authorization handoff. The boundary is trusted
 * server composition and must derive its evidence from verified Entra
 * authentication, canonical Staff, and configured administrator policy.
 * Receipts are empty in-memory capabilities; this contract does not persist
 * approvals or execute the acceptance operation.
 */
export function createEntraStaffAcceptanceHandoff(
  configuration: Readonly<{ enabled?: boolean }> = {},
  boundary?: TrustedEntraStaffAcceptanceBoundary,
  now: () => number = Date.now
): Readonly<{
  issue: (operation: unknown) => Promise<EntraStaffAcceptanceHandoffResult>;
  consume: (
    receipt: unknown,
    operation: unknown
  ) => Promise<EntraStaffAcceptanceHandoffResult>;
}> {
  const issued = new WeakMap<object, HandoffState>();

  async function resolveEvidence():
    Promise<
      | { identityKey: string; verifiedAt: number }
      | { status: "expired" | "denied" | "boundary_unavailable" }
    > {
    if (!boundary) {
      return { status: "boundary_unavailable" };
    }

    try {
      const evidence = await boundary.resolveAuthorizedEvidence();
      if (!evidence) {
        return { status: "denied" };
      }

      const identityKey = trustedIdentityKey(evidence, now());
      if (identityKey === "expired") {
        return { status: "expired" };
      }
      if (!identityKey) {
        return { status: "denied" };
      }

      return {
        identityKey: identityKey.identityKey,
        verifiedAt: identityKey.verifiedAt
      };
    } catch {
      return { status: "boundary_unavailable" };
    }
  }

  async function issue(
    operation: unknown
  ): Promise<EntraStaffAcceptanceHandoffResult> {
    if (configuration.enabled !== true) {
      return denied("disabled");
    }
    if (operation !== ENTRA_STAFF_ACCEPTANCE_OPERATION) {
      return denied("operation_mismatch");
    }

    const evidence = await resolveEvidence();
    if ("status" in evidence) {
      return denied(evidence.status);
    }

    const receipt = Object.freeze(Object.create(null)) as object;
    issued.set(receipt, {
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityKey: evidence.identityKey,
      expiresAt: evidence.verifiedAt + MAX_EVIDENCE_AGE_MS
    });

    return Object.freeze({ status: "issued", receipt });
  }

  async function consume(
    receipt: unknown,
    operation: unknown
  ): Promise<EntraStaffAcceptanceHandoffResult> {
    if (configuration.enabled !== true) {
      return denied("disabled");
    }
    if (!isRecord(receipt)) {
      return denied("invalid_receipt");
    }

    const state = issued.get(receipt);
    if (!state) {
      return denied("invalid_receipt");
    }

    issued.delete(receipt);
    if (
      operation !== ENTRA_STAFF_ACCEPTANCE_OPERATION ||
      operation !== state.operation
    ) {
      return denied("operation_mismatch");
    }

    const currentTime = now();
    if (
      !Number.isSafeInteger(currentTime) ||
      currentTime > state.expiresAt
    ) {
      return denied("expired");
    }

    const evidence = await resolveEvidence();
    if ("status" in evidence) {
      return denied(evidence.status);
    }
    if (
      evidence.verifiedAt > state.expiresAt ||
      evidence.identityKey !== state.identityKey
    ) {
      return denied(
        evidence.verifiedAt > state.expiresAt ? "expired" : "denied"
      );
    }

    return Object.freeze({ status: "authorized" });
  }

  return Object.freeze({ issue, consume });
}
