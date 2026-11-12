import { createHash, randomBytes } from "node:crypto";
import { normalizeEntraStaffBinding } from "../../domain/staff/projectStaffDirectory";
import {
  ENTRA_STAFF_ACCEPTANCE_OPERATION,
  type EntraStaffAcceptanceReceiptRecord,
  type EntraStaffAcceptanceReceiptRepository
} from "../../repositories/entraStaffAcceptanceHandoffReceiptStorageRepository";

export { ENTRA_STAFF_ACCEPTANCE_OPERATION };

const MAX_EVIDENCE_AGE_MS = 5 * 60 * 1000;
const MAX_RECEIPT_AGE_MS = 60 * 1000;
const MAX_SAFE_DATE = 8640000000000000;
const RECEIPT_ID_PATTERN = /^[0-9a-f]{64}$/;

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

export type EntraStaffAcceptanceReceipt = Readonly<{
  receiptId: string;
}>;

export type EntraStaffAcceptanceHandoffResult =
  | Readonly<{
      status: "issued";
      receipt: EntraStaffAcceptanceReceipt;
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
        | "boundary_unavailable"
        | "storage_unavailable";
    }>;

type TrustedEvidenceResult =
  | Readonly<{
      status: "valid";
      identityDigest: string;
      verifiedAt: number;
      now: number;
    }>
  | Readonly<{
      status: "denied" | "expired" | "boundary_unavailable";
    }>;

type Dependencies = Readonly<{
  boundary?: TrustedEntraStaffAcceptanceBoundary;
  repository?: EntraStaffAcceptanceReceiptRepository;
  now?: () => number;
  createReceiptId?: () => string;
}>;

function isRecord(value: unknown): value is Record<string | symbol, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function ownData(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.prototype.hasOwnProperty.call(descriptor, "value")
    ? descriptor.value
    : undefined;
}

function exactKeys(value: object, keys: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value);
  return actual.length === keys.length &&
    keys.every(key => actual.includes(key));
}

function validTime(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_SAFE_DATE;
}

function identityDigest(
  receiptId: string,
  staffId: string,
  tenantId: string,
  objectId: string
): string {
  return createHash("sha256")
    .update(JSON.stringify([receiptId, staffId, tenantId, objectId]))
    .digest("hex");
}

function denied(
  status: Exclude<
    EntraStaffAcceptanceHandoffResult["status"],
    "issued" | "authorized"
  >
): EntraStaffAcceptanceHandoffResult {
  return Object.freeze({ status });
}

function parseReceipt(value: unknown): string | null {
  try {
    if (
      !isRecord(value) ||
      !exactKeys(value, ["receiptId"])
    ) {
      return null;
    }

    const receiptId = ownData(value, "receiptId");
    return typeof receiptId === "string" &&
      RECEIPT_ID_PATTERN.test(receiptId)
      ? receiptId
      : null;
  } catch {
    return null;
  }
}

/**
 * The server-side boundary must authenticate the Entra token, resolve current
 * canonical Staff, and authorize system.admin on every call. It accepts no
 * request data and must not be constructed from caller-supplied IDs.
 */
async function resolveTrustedEvidence(
  boundary: TrustedEntraStaffAcceptanceBoundary | undefined,
  nowProvider: () => number,
  receiptId: string
): Promise<TrustedEvidenceResult> {
  if (!boundary) {
    return { status: "boundary_unavailable" };
  }

  try {
    const evidence = await boundary.resolveAuthorizedEvidence();
    if (!evidence || !isRecord(evidence) ||
        !exactKeys(evidence, [
          "verifiedIdentity",
          "canonicalStaff",
          "administratorAuthorized",
          "verifiedAt"
        ])) {
      return { status: "denied" };
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
      return { status: "denied" };
    }

    const staffId = ownData(verifiedIdentity, "staffId");
    const tenantId = ownData(verifiedIdentity, "tenantId");
    const objectId = ownData(verifiedIdentity, "objectId");
    const canonicalStaffId = ownData(canonicalStaff, "staffId");
    const canonicalStatus = ownData(canonicalStaff, "status");
    const canonicalTenantId = ownData(canonicalStaff, "entraTenantId");
    const canonicalObjectId = ownData(canonicalStaff, "entraObjectId");

    if (
      typeof staffId !== "string" ||
      staffId.trim() === "" ||
      staffId !== canonicalStaffId ||
      canonicalStatus !== "active" ||
      administratorAuthorized !== true ||
      !validTime(verifiedAt)
    ) {
      return { status: "denied" };
    }

    const verifiedBinding = normalizeEntraStaffBinding(tenantId, objectId);
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
      return { status: "denied" };
    }

    const now = nowProvider();
    if (!validTime(now) || verifiedAt > now) {
      return { status: "denied" };
    }
    if (now - verifiedAt > MAX_EVIDENCE_AGE_MS) {
      return { status: "expired" };
    }

    return {
      status: "valid",
      identityDigest: identityDigest(
        receiptId,
        staffId,
        verifiedBinding.entraTenantId,
        verifiedBinding.entraObjectId
      ),
      verifiedAt,
      now
    };
  } catch {
    return { status: "boundary_unavailable" };
  }
}

/**
 * Durable authorization handoff. The repository must provide create-only
 * receipt issuance and ETag-conditional atomic consumption. No operation is
 * executed by this contract, and all dependencies are trusted server-side.
 */
export function createEntraStaffAcceptanceHandoff(
  configuration: Readonly<{ enabled?: boolean }> = {},
  dependencies: Dependencies = {}
): Readonly<{
  issue: (operation: unknown) => Promise<EntraStaffAcceptanceHandoffResult>;
  consume: (
    receipt: unknown,
    operation: unknown
  ) => Promise<EntraStaffAcceptanceHandoffResult>;
}> {
  const nowProvider = dependencies.now ?? Date.now;
  const createReceiptId =
    dependencies.createReceiptId ??
    (() => randomBytes(32).toString("hex"));
  const repository = dependencies.repository;

  async function issue(
    operation: unknown
  ): Promise<EntraStaffAcceptanceHandoffResult> {
    if (configuration.enabled !== true) {
      return denied("disabled");
    }
    if (operation !== ENTRA_STAFF_ACCEPTANCE_OPERATION) {
      return denied("operation_mismatch");
    }
    if (!repository ||
        typeof repository.issueIfAbsent !== "function") {
      return denied("storage_unavailable");
    }

    let receiptId: string;
    try {
      receiptId = createReceiptId();
    } catch {
      return denied("storage_unavailable");
    }
    if (
      typeof receiptId !== "string" ||
      !RECEIPT_ID_PATTERN.test(receiptId)
    ) {
      return denied("storage_unavailable");
    }

    const evidence = await resolveTrustedEvidence(
      dependencies.boundary,
      nowProvider,
      receiptId
    );
    if (evidence.status !== "valid") {
      return denied(evidence.status);
    }

    const expiresAtMs = Math.min(
      evidence.verifiedAt + MAX_EVIDENCE_AGE_MS,
      evidence.now + MAX_RECEIPT_AGE_MS
    );
    if (!validTime(expiresAtMs) || expiresAtMs <= evidence.now) {
      return denied("expired");
    }

    const record: EntraStaffAcceptanceReceiptRecord = Object.freeze({
      receiptId,
      operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
      identityDigest: evidence.identityDigest,
      issuedAtMs: evidence.now,
      expiresAtMs
    });

    try {
      const outcome = await repository.issueIfAbsent(record);
      if (outcome !== "issued") {
        return denied(
          outcome === "unavailable"
            ? "storage_unavailable"
            : "denied"
        );
      }
    } catch {
      return denied("storage_unavailable");
    }

    let confirmedAt: number;
    try {
      confirmedAt = nowProvider();
    } catch {
      return denied("boundary_unavailable");
    }
    if (
      !validTime(confirmedAt) ||
      confirmedAt < evidence.now ||
      confirmedAt >= expiresAtMs
    ) {
      return denied("expired");
    }

    return Object.freeze({
      status: "issued",
      receipt: Object.freeze({ receiptId })
    });
  }

  async function consume(
    receipt: unknown,
    operation: unknown
  ): Promise<EntraStaffAcceptanceHandoffResult> {
    if (configuration.enabled !== true) {
      return denied("disabled");
    }
    if (operation !== ENTRA_STAFF_ACCEPTANCE_OPERATION) {
      return denied("operation_mismatch");
    }

    const receiptId = parseReceipt(receipt);
    if (!receiptId) {
      return denied("invalid_receipt");
    }
    if (!repository ||
        typeof repository.consumeIfAvailable !== "function") {
      return denied("storage_unavailable");
    }

    const evidence = await resolveTrustedEvidence(
      dependencies.boundary,
      nowProvider,
      receiptId
    );
    if (evidence.status !== "valid") {
      return denied(evidence.status);
    }

    try {
      const outcome = await repository.consumeIfAvailable({
        receiptId,
        operation: ENTRA_STAFF_ACCEPTANCE_OPERATION,
        identityDigest: evidence.identityDigest
      });

      if (outcome === "consumed") {
        return Object.freeze({ status: "authorized" });
      }
      return denied(
        outcome === "unavailable"
          ? "storage_unavailable"
          : "denied"
      );
    } catch {
      return denied("storage_unavailable");
    }
  }

  return Object.freeze({ issue, consume });
}
