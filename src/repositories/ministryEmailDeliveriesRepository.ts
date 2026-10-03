import type { MinistryEmailDeliveryRecord } from "../domain/communications/ministryEmailDeliveryContracts";
import { getTableClient } from "../storage/tableClient";

export const MINISTRY_EMAIL_DELIVERIES_TABLE_NAME = "MinistryEmailDeliveries";
// A global partition makes deliveryId unique even if a client reuses it across visitors.
const DELIVERY_ID_PARTITION_KEY = "EMAIL_DELIVERIES";

type MinistryEmailDeliveryEntity = {
  partitionKey: string;
  rowKey: string;
  deliveryJson: string;
  etag: string;
};

type MinistryEmailDeliveryWriteEntity = {
  partitionKey: string;
  rowKey: string;
  deliveryJson: string;
};

type MinistryEmailDeliveryTable = {
  createEntity(entity: MinistryEmailDeliveryWriteEntity): Promise<unknown>;
  getEntity(partitionKey: string, rowKey: string): Promise<MinistryEmailDeliveryEntity>;
  updateEntity(
    entity: MinistryEmailDeliveryWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown>;
};

type TableFactory = (tableName: string) => Promise<MinistryEmailDeliveryTable>;

async function getDeliveryTable(tableName: string): Promise<MinistryEmailDeliveryTable> {
  const table = await getTableClient(tableName);
  return {
    createEntity: entity => table.createEntity<MinistryEmailDeliveryWriteEntity>(entity),
    getEntity: (partitionKey, rowKey) =>
      table.getEntity<MinistryEmailDeliveryEntity>(partitionKey, rowKey),
    updateEntity: (entity, mode, options) =>
      table.updateEntity<MinistryEmailDeliveryWriteEntity>(entity, mode, options)
  };
}

function isConflict(error: unknown): boolean {
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown } | null;
  const status = Number(value?.statusCode ?? value?.status ?? 0);
  const code = String(value?.code ?? "");
  return status === 409 || code === "EntityAlreadyExists";
}

function isNotFound(error: unknown): boolean {
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown } | null;
  const status = Number(value?.statusCode ?? value?.status ?? 0);
  const code = String(value?.code ?? "");
  return status === 404 || code === "ResourceNotFound";
}

function isPreconditionFailed(error: unknown): boolean {
  const value = error as { statusCode?: unknown; status?: unknown; code?: unknown } | null;
  const status = Number(value?.statusCode ?? value?.status ?? 0);
  return status === 412;
}

function fromEntity(entity: MinistryEmailDeliveryEntity): MinistryEmailDeliveryRecord {
  const stored = JSON.parse(entity.deliveryJson) as Omit<
    MinistryEmailDeliveryRecord,
    "dispatchAttemptId" | "dispatchClaimedAt"
  > & Partial<Pick<MinistryEmailDeliveryRecord, "dispatchAttemptId" | "dispatchClaimedAt">>;
  const record: MinistryEmailDeliveryRecord = {
    ...stored,
    dispatchAttemptId: stored.dispatchAttemptId ?? null,
    dispatchClaimedAt: stored.dispatchClaimedAt ?? null
  };
  if (
    entity.partitionKey !== DELIVERY_ID_PARTITION_KEY ||
    record.deliveryId !== entity.rowKey
  ) {
    throw new Error("Stored ministry email delivery identity does not match its table keys");
  }
  return record;
}

function sameRequest(
  current: MinistryEmailDeliveryRecord,
  next: MinistryEmailDeliveryRecord
): boolean {
  return current.schemaVersion === next.schemaVersion &&
    current.deliveryId === next.deliveryId &&
    current.communicationId === next.communicationId &&
    current.visitorId === next.visitorId &&
    current.channel === next.channel &&
    current.requestedAt === next.requestedAt &&
    current.requestedBy === next.requestedBy &&
    current.subject === next.subject &&
    current.body === next.body &&
    current.recipientEmail === next.recipientEmail &&
    current.eligibility.phase5Enabled === next.eligibility.phase5Enabled &&
    current.eligibility.contactConsent === next.eligibility.contactConsent &&
    current.eligibility.emailPreference === next.eligibility.emailPreference;
}

/**
 * Stores immutable email-delivery request snapshots separately from
 * MinistryCommunicationEvents. Initial writes are create-only, never upserts.
 */
export class MinistryEmailDeliveriesRepository {
  constructor(private readonly tableFactory: TableFactory = getDeliveryTable) {}

  async create(record: MinistryEmailDeliveryRecord): Promise<boolean> {
    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    try {
      await table.createEntity({
        partitionKey: DELIVERY_ID_PARTITION_KEY,
        rowKey: record.deliveryId,
        deliveryJson: JSON.stringify(record)
      });
      return true;
    } catch (error) {
      if (isConflict(error)) return false;
      throw error;
    }
  }

  async getById(
    deliveryId: string
  ): Promise<MinistryEmailDeliveryRecord | null> {
    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    try {
      return fromEntity(await table.getEntity(DELIVERY_ID_PARTITION_KEY, deliveryId));
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readVersionedById(
    deliveryId: string
  ): Promise<{ record: MinistryEmailDeliveryRecord; version: string } | null> {
    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    try {
      const entity = await table.getEntity(DELIVERY_ID_PARTITION_KEY, deliveryId);
      if (!entity.etag) {
        throw new Error("Stored ministry email delivery is missing its ETag");
      }
      return { record: fromEntity(entity), version: entity.etag };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  /** Durably claims a requested row; ETag prevents multiple workers winning. */
  async claimIfVersion(
    nextRecord: MinistryEmailDeliveryRecord,
    expectedVersion: string
  ): Promise<boolean> {
    if (!expectedVersion.trim()) return false;

    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    let currentEntity: MinistryEmailDeliveryEntity;
    try {
      currentEntity = await table.getEntity(
        DELIVERY_ID_PARTITION_KEY,
        nextRecord.deliveryId
      );
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }

    if (currentEntity.etag !== expectedVersion) return false;
    const currentRecord = fromEntity(currentEntity);
    if (
      currentRecord.state !== "requested" ||
      nextRecord.state !== "dispatching" ||
      currentRecord.dispatchAttemptId !== null ||
      currentRecord.dispatchClaimedAt !== null ||
      nextRecord.dispatchAttemptId?.trim() === "" ||
      !nextRecord.dispatchAttemptId ||
      !nextRecord.dispatchClaimedAt?.trim() ||
      nextRecord.provider !== null ||
      nextRecord.providerMessageId !== null ||
      nextRecord.providerAcceptedAt !== null ||
      nextRecord.failedAt !== null ||
      nextRecord.failureCode !== null ||
      !sameRequest(currentRecord, nextRecord)
    ) {
      return false;
    }

    return this.replaceWithVersion(nextRecord, expectedVersion);
  }

  /**
   * Conditionally persists a terminal provider result from an existing claim.
   * No requested row can jump directly to a provider result, and a terminal
   * row cannot be overwritten by a stale worker.
   */
  async transitionIfVersion(
    nextRecord: MinistryEmailDeliveryRecord,
    expectedVersion: string
  ): Promise<boolean> {
    if (!expectedVersion.trim()) return false;

    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    let currentEntity: MinistryEmailDeliveryEntity;
    try {
      currentEntity = await table.getEntity(
        DELIVERY_ID_PARTITION_KEY,
        nextRecord.deliveryId
      );
    } catch (error) {
      if (isNotFound(error)) return false;
      throw error;
    }

    if (currentEntity.etag !== expectedVersion) return false;
    const currentRecord = fromEntity(currentEntity);
    if (
      currentRecord.state !== "dispatching" ||
      (nextRecord.state !== "provider_accepted" && nextRecord.state !== "failed") ||
      !sameRequest(currentRecord, nextRecord) ||
      !currentRecord.dispatchAttemptId ||
      !currentRecord.dispatchClaimedAt ||
      nextRecord.dispatchAttemptId !== currentRecord.dispatchAttemptId ||
      nextRecord.dispatchClaimedAt !== currentRecord.dispatchClaimedAt
    ) {
      return false;
    }

    return this.replaceWithVersion(nextRecord, expectedVersion);
  }

  private async replaceWithVersion(
    nextRecord: MinistryEmailDeliveryRecord,
    expectedVersion: string
  ): Promise<boolean> {
    const table = await this.tableFactory(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME);
    try {
      await table.updateEntity(
        {
          partitionKey: DELIVERY_ID_PARTITION_KEY,
          rowKey: nextRecord.deliveryId,
          deliveryJson: JSON.stringify(nextRecord)
        },
        "Replace",
        { etag: expectedVersion }
      );
      return true;
    } catch (error) {
      if (isPreconditionFailed(error) || isNotFound(error)) return false;
      throw error;
    }
  }
}
