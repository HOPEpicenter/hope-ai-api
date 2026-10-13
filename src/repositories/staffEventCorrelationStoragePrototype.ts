import {
  classifyStaffEventCorrelationEvidence,
  type StaffEventCorrelationEvidenceStatus,
  type StaffEventCorrelationEvidenceV1
} from "../contracts/staffEventCorrelationEvidence.v1";
import type { StaffEvent } from "../domain/staff/projectStaffDirectory";

/**
 * Isolated, test-only storage prototype. It is NOT the production StaffEvents
 * repository, is not wired into any writer, and never retries.
 *
 * Entity identity matches StaffEventsRepository:
 *   partitionKey = staffId, rowKey = `${occurredAt}__${eventId}`,
 *   dataJson = JSON.stringify(event.data).
 * Correlation metadata is stored separately in `correlationMetadataJson`.
 *
 * Limitation: row-key uniqueness only protects one (partition, row) in one
 * table. Operation-ID uniqueness across rows, partitions, or tables is NOT
 * enforced here. Persisted metadata is writer-supplied and never proves a
 * committed security operation.
 */
export const STAFF_EVENT_CORRELATION_STORAGE_PROTOTYPE_TABLE_PREFIX =
  "StaffEventCorrelationProof";

export type StaffEventCorrelationStorageEntity = {
  partitionKey: string;
  rowKey: string;
  eventId: string;
  staffId: string;
  type: string;
  occurredAt: string;
  actorId: string;
  dataJson: string;
  correlationMetadataJson?: string;
};

export type StaffEventCorrelationStoragePort = {
  readonly tableName: string;
  createEntity(entity: StaffEventCorrelationStorageEntity): Promise<unknown>;
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<Record<string, unknown>>;
};

const nonAuthorizing = {
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  securityTransactionVerified: false,
  staffEventsAppendVerified: false,
  operationIdUniquenessEnforced: false
} as const;

type NonAuthorizing = typeof nonAuthorizing;

export type StaffEventCorrelationCreateStatus =
  | "created"
  | "rejected_invalid"
  | "duplicate_identical"
  | "duplicate_conflicting"
  | "uncertain";

export type StaffEventCorrelationCreateResult = Readonly<NonAuthorizing & {
  status: StaffEventCorrelationCreateStatus;
  diagnostic: string;
  partitionKey?: string;
  rowKey?: string;
  createAttempts: number;
}>;

export type StaffEventCorrelationReadStatus =
  | StaffEventCorrelationEvidenceStatus
  | "not_found"
  | "read_failed"
  | "key_mismatch"
  | "identity_mismatch"
  | "malformed_entity";

export type StaffEventCorrelationReadResult = Readonly<NonAuthorizing & {
  status: StaffEventCorrelationReadStatus;
  diagnostic: string;
  event?: StaffEvent;
  evidence?: StaffEventCorrelationEvidenceV1;
  correlationEvidenceUsable: boolean;
}>;

export type StaffEventIdentity = Readonly<{
  staffId: string;
  eventId: string;
  occurredAt: string;
}>;

export function staffEventCorrelationRowKey(event: StaffEventIdentity): string {
  return `${event.occurredAt}__${event.eventId}`;
}

function statusOf(error: unknown): number | undefined {
  const code = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : undefined;
}

function toEntity(
  event: StaffEvent,
  metadata: unknown
): StaffEventCorrelationStorageEntity {
  return {
    partitionKey: event.staffId,
    rowKey: staffEventCorrelationRowKey(event),
    eventId: event.eventId,
    staffId: event.staffId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    dataJson: JSON.stringify(event.data),
    ...(metadata === undefined
      ? {}
      : { correlationMetadataJson: JSON.stringify(metadata) })
  };
}

const compared = [
  "eventId",
  "staffId",
  "type",
  "occurredAt",
  "actorId",
  "dataJson",
  "correlationMetadataJson"
] as const;

export class StaffEventCorrelationStoragePrototype {
  constructor(private readonly table: StaffEventCorrelationStoragePort) {
    const name = table?.tableName;
    if (
      typeof name !== "string" ||
      !name.startsWith(STAFF_EVENT_CORRELATION_STORAGE_PROTOTYPE_TABLE_PREFIX) ||
      !/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(name)
    ) {
      throw new Error("Explicit isolated test table required");
    }
  }

  /**
   * Single create-only attempt. Metadata is optional (legacy event); when
   * supplied it must classify as `valid`. Never upserts and never retries.
   */
  async create(
    event: StaffEvent,
    metadata?: unknown
  ): Promise<StaffEventCorrelationCreateResult> {
    // Only an omitted value means legacy; explicit null is rejected here.
    const classification = classifyStaffEventCorrelationEvidence(
      event,
      metadata
    );
    const acceptable = metadata === undefined
      ? classification.status === "legacy"
      : metadata !== null && classification.status === "valid";
    if (!acceptable) {
      return {
        status: "rejected_invalid",
        diagnostic: `${classification.status}:${classification.diagnostic}`,
        createAttempts: 0,
        ...nonAuthorizing
      };
    }

    const entity = toEntity(event, metadata);
    const keys = { partitionKey: entity.partitionKey, rowKey: entity.rowKey };
    try {
      await this.table.createEntity(entity);
      return {
        status: "created",
        diagnostic: "created_not_independently_verified",
        ...keys,
        createAttempts: 1,
        ...nonAuthorizing
      };
    } catch (error) {
      if (statusCode409(error)) {
        return this.classifyDuplicate(entity, keys);
      }
      return {
        status: "uncertain",
        diagnostic: "storage_acknowledgement_uncertain_not_retried",
        ...keys,
        createAttempts: 1,
        ...nonAuthorizing
      };
    }
  }

  private async classifyDuplicate(
    proposed: StaffEventCorrelationStorageEntity,
    keys: { partitionKey: string; rowKey: string }
  ): Promise<StaffEventCorrelationCreateResult> {
    try {
      const existing = await this.table.getEntity(
        proposed.partitionKey,
        proposed.rowKey
      );
      const identical = compared.every(
        field => existing[field] === (proposed as Record<string, unknown>)[field]
      );
      return {
        status: identical ? "duplicate_identical" : "duplicate_conflicting",
        diagnostic: "row_exists_original_preserved",
        ...keys,
        createAttempts: 1,
        ...nonAuthorizing
      };
    } catch {
      return {
        status: "uncertain",
        diagnostic: "existing_row_contents_could_not_be_independently_verified",
        ...keys,
        createAttempts: 1,
        ...nonAuthorizing
      };
    }
  }

  /** Independent read by expected identity, validated fail-closed. */
  async read(
    identity: StaffEventIdentity
  ): Promise<StaffEventCorrelationReadResult> {
    const fail = (
      status: StaffEventCorrelationReadStatus,
      diagnostic: string
    ): StaffEventCorrelationReadResult => ({
      status,
      diagnostic,
      correlationEvidenceUsable: false,
      ...nonAuthorizing
    });

    const partitionKey = identity.staffId;
    const rowKey = staffEventCorrelationRowKey(identity);
    let entity: Record<string, unknown>;
    try {
      entity = await this.table.getEntity(partitionKey, rowKey);
    } catch (error) {
      return statusOf(error) === 404
        ? fail("not_found", "entity_not_found")
        : fail("read_failed", "storage_read_failed");
    }

    if (entity.partitionKey !== partitionKey || entity.rowKey !== rowKey) {
      return fail("key_mismatch", "stored_keys_differ_from_expected_identity");
    }
    if (
      typeof entity.eventId !== "string" ||
      typeof entity.staffId !== "string" ||
      typeof entity.type !== "string" ||
      typeof entity.occurredAt !== "string" ||
      typeof entity.actorId !== "string" ||
      typeof entity.dataJson !== "string"
    ) {
      return fail("malformed_entity", "required_event_fields_missing");
    }
    if (
      entity.eventId !== identity.eventId ||
      entity.staffId !== identity.staffId ||
      entity.occurredAt !== identity.occurredAt
    ) {
      return fail("identity_mismatch", "stored_event_identity_differs_from_keys");
    }

    let data: unknown;
    try {
      data = JSON.parse(entity.dataJson || "{}");
    } catch {
      return fail("malformed_entity", "dataJson_unparseable");
    }
    const event = {
      eventId: entity.eventId,
      staffId: entity.staffId,
      type: entity.type,
      occurredAt: entity.occurredAt,
      actorId: entity.actorId,
      data
    } as StaffEvent;

    let metadata: unknown;
    const raw = entity.correlationMetadataJson;
    if (raw !== undefined && raw !== null) {
      if (typeof raw !== "string") {
        return { ...fail("malformed", "metadata_not_a_string"), event };
      }
      try {
        metadata = JSON.parse(raw);
      } catch {
        return { ...fail("malformed", "metadata_unparseable"), event };
      }
      // A stored JSON null must not be mistaken for missing (legacy) metadata.
      if (metadata === null) {
        return { ...fail("malformed", "metadata_null"), event };
      }
    }

    const classification = classifyStaffEventCorrelationEvidence(
      event,
      metadata
    );
    return {
      status: classification.status,
      diagnostic: classification.diagnostic,
      event,
      ...(classification.normalizedEvidence
        ? { evidence: classification.normalizedEvidence }
        : {}),
      correlationEvidenceUsable: classification.status === "valid",
      ...nonAuthorizing
    };
  }
}

function statusCode409(error: unknown): boolean {
  return statusOf(error) === 409;
}
