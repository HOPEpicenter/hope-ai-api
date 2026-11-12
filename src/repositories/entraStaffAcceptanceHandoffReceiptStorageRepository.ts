export const ENTRA_STAFF_ACCEPTANCE_RECEIPT_TABLE_NAME =
  "EntraStaffAcceptanceReceipts";
export const ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY =
  "PHASE_C_STAFF_BINDING";

export const ENTRA_STAFF_ACCEPTANCE_OPERATION =
  "phase-c.staff-binding.acceptance" as const;

export type EntraStaffAcceptanceReceiptRecord = Readonly<{
  receiptId: string;
  operation: typeof ENTRA_STAFF_ACCEPTANCE_OPERATION;
  identityDigest: string;
  issuedAtMs: number;
  expiresAtMs: number;
}>;

export type EntraStaffAcceptanceReceiptConsumption = Readonly<{
  receiptId: string;
  operation: typeof ENTRA_STAFF_ACCEPTANCE_OPERATION;
  identityDigest: string;
}>;

export type EntraStaffAcceptanceReceiptStorageStatus =
  | "issued"
  | "consumed"
  | "denied"
  | "unavailable";

export interface EntraStaffAcceptanceReceiptRepository {
  issueIfAbsent(
    record: EntraStaffAcceptanceReceiptRecord
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus>;
  consumeIfAvailable(
    request: EntraStaffAcceptanceReceiptConsumption
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus>;
}

export interface EntraStaffAcceptanceReceiptTableEntity {
  partitionKey: string;
  rowKey: string;
  schemaVersion: number;
  operation: string;
  identityDigest: string;
  issuedAtMs: number;
  expiresAtMs: number;
  state: "issued" | "consumed";
  revision: number;
  consumedAtMs?: number;
  etag: string;
}

export type EntraStaffAcceptanceReceiptWriteEntity = Omit<
  EntraStaffAcceptanceReceiptTableEntity,
  "etag"
>;

export interface EntraStaffAcceptanceReceiptTablePort {
  createEntity(
    entity: EntraStaffAcceptanceReceiptWriteEntity
  ): Promise<unknown>;
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<EntraStaffAcceptanceReceiptTableEntity>;
  updateEntity(
    entity: EntraStaffAcceptanceReceiptWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown>;
}

const RECEIPT_ID_PATTERN = /^[0-9a-f]{64}$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MAX_SAFE_DATE = 8640000000000000;
const MAX_RECEIPT_AGE_MS = 60 * 1000;

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAX_SAFE_DATE;
}

function validRecord(
  value: EntraStaffAcceptanceReceiptRecord
): boolean {
  return !!value &&
    typeof value === "object" &&
    typeof value.receiptId === "string" &&
    RECEIPT_ID_PATTERN.test(value.receiptId) &&
    value.operation === ENTRA_STAFF_ACCEPTANCE_OPERATION &&
    typeof value.identityDigest === "string" &&
    DIGEST_PATTERN.test(value.identityDigest) &&
    validTime(value.issuedAtMs) &&
    validTime(value.expiresAtMs) &&
    value.expiresAtMs > value.issuedAtMs &&
    value.expiresAtMs - value.issuedAtMs <= MAX_RECEIPT_AGE_MS;
}

function validConsumption(
  value: EntraStaffAcceptanceReceiptConsumption
): boolean {
  return !!value &&
    typeof value === "object" &&
    typeof value.receiptId === "string" &&
    RECEIPT_ID_PATTERN.test(value.receiptId) &&
    value.operation === ENTRA_STAFF_ACCEPTANCE_OPERATION &&
    typeof value.identityDigest === "string" &&
    DIGEST_PATTERN.test(value.identityDigest);
}

function trustedClock(value: number): boolean {
  return validTime(value);
}

function expectedConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  try {
    const statusCode = Reflect.get(error, "statusCode");
    const status = Reflect.get(error, "status");
    const code = Reflect.get(error, "code");
    if (code === "TableNotFound") {
      return false;
    }

    const numericStatus = Number(statusCode ?? status ?? 0);
    return numericStatus === 409 ||
      numericStatus === 412 ||
      (
        numericStatus === 404 &&
        code !== "TableNotFound"
      ) ||
      code === "ResourceNotFound" ||
      code === "EntityNotFound" ||
      code === "UpdateConditionNotSatisfied" ||
      code === "ConditionNotMet";
  } catch {
    return false;
  }
}

function matchesIssuedEntity(
  entity: EntraStaffAcceptanceReceiptTableEntity,
  request: EntraStaffAcceptanceReceiptConsumption
): boolean {
  return !!entity &&
    entity.partitionKey === ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY &&
    entity.rowKey === request.receiptId &&
    entity.schemaVersion === 1 &&
    entity.operation === request.operation &&
    entity.identityDigest === request.identityDigest &&
    validTime(entity.issuedAtMs) &&
    validTime(entity.expiresAtMs) &&
    entity.expiresAtMs > entity.issuedAtMs &&
    entity.expiresAtMs - entity.issuedAtMs <= MAX_RECEIPT_AGE_MS &&
    entity.state === "issued" &&
    entity.revision === 0 &&
    entity.consumedAtMs === undefined &&
    typeof entity.etag === "string" &&
    entity.etag.length > 0 &&
    entity.etag !== "*";
}

/**
 * Non-provisioning Azure Table adapter. Creation uses the unique row key;
 * consumption uses a single ETag-conditional Replace. It never writes raw
 * Staff or Entra identifiers and never retries uncertain writes.
 */
export class EntraStaffAcceptanceHandoffReceiptStorageRepository
implements EntraStaffAcceptanceReceiptRepository {
  constructor(
    private readonly table: EntraStaffAcceptanceReceiptTablePort,
    private readonly clock: () => number = Date.now
  ) {}

  async issueIfAbsent(
    record: EntraStaffAcceptanceReceiptRecord
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus> {
    if (
      !validRecord(record) ||
      !this.table ||
      typeof this.table.createEntity !== "function"
    ) {
      return "denied";
    }

    try {
      await this.table.createEntity({
        partitionKey: ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY,
        rowKey: record.receiptId,
        schemaVersion: 1,
        operation: record.operation,
        identityDigest: record.identityDigest,
        issuedAtMs: record.issuedAtMs,
        expiresAtMs: record.expiresAtMs,
        state: "issued",
        revision: 0
      });

      return "issued";
    } catch (error) {
      return expectedConflict(error) ? "denied" : "unavailable";
    }
  }

  async consumeIfAvailable(
    request: EntraStaffAcceptanceReceiptConsumption
  ): Promise<EntraStaffAcceptanceReceiptStorageStatus> {
    if (
      !validConsumption(request) ||
      !this.table ||
      typeof this.table.getEntity !== "function" ||
      typeof this.table.updateEntity !== "function"
    ) {
      return "denied";
    }

    let entity: EntraStaffAcceptanceReceiptTableEntity;
    try {
      entity = await this.table.getEntity(
        ENTRA_STAFF_ACCEPTANCE_RECEIPT_PARTITION_KEY,
        request.receiptId
      );
    } catch (error) {
      return expectedConflict(error) ? "denied" : "unavailable";
    }

    if (!matchesIssuedEntity(entity, request)) {
      return "denied";
    }

    const checkedAt = this.clock();
    if (
      !trustedClock(checkedAt) ||
      entity.issuedAtMs > checkedAt ||
      checkedAt >= entity.expiresAtMs
    ) {
      return "denied";
    }

    const commitCheckAt = this.clock();
    if (
      !trustedClock(commitCheckAt) ||
      commitCheckAt < checkedAt ||
      commitCheckAt >= entity.expiresAtMs
    ) {
      return "denied";
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          schemaVersion: entity.schemaVersion,
          operation: entity.operation,
          identityDigest: entity.identityDigest,
          issuedAtMs: entity.issuedAtMs,
          expiresAtMs: entity.expiresAtMs,
          state: "consumed",
          revision: 1,
          consumedAtMs: commitCheckAt
        },
        "Replace",
        { etag: entity.etag }
      );
    } catch (error) {
      return expectedConflict(error) ? "denied" : "unavailable";
    }

    const confirmedAt = this.clock();
    if (
      !trustedClock(confirmedAt) ||
      confirmedAt < commitCheckAt ||
      confirmedAt >= entity.expiresAtMs
    ) {
      return "denied";
    }

    return "consumed";
  }
}
