import type { MinistryEmailDeliveryRecord } from "../domain/communications/ministryEmailDeliveryContracts";
import { getTableClient } from "../storage/tableClient";

export const MINISTRY_EMAIL_DELIVERIES_TABLE_NAME = "MinistryEmailDeliveries";
// A global partition makes deliveryId unique even if a client reuses it across visitors.
const DELIVERY_ID_PARTITION_KEY = "EMAIL_DELIVERIES";

type MinistryEmailDeliveryEntity = {
  partitionKey: string;
  rowKey: string;
  deliveryJson: string;
};

type MinistryEmailDeliveryTable = {
  createEntity(entity: MinistryEmailDeliveryEntity): Promise<unknown>;
  getEntity(partitionKey: string, rowKey: string): Promise<MinistryEmailDeliveryEntity>;
};

type TableFactory = (tableName: string) => Promise<MinistryEmailDeliveryTable>;

async function getDeliveryTable(tableName: string): Promise<MinistryEmailDeliveryTable> {
  const table = await getTableClient(tableName);
  return {
    createEntity: entity => table.createEntity<MinistryEmailDeliveryEntity>(entity),
    getEntity: (partitionKey, rowKey) =>
      table.getEntity<MinistryEmailDeliveryEntity>(partitionKey, rowKey)
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

function fromEntity(entity: MinistryEmailDeliveryEntity): MinistryEmailDeliveryRecord {
  const record = JSON.parse(entity.deliveryJson) as MinistryEmailDeliveryRecord;
  if (
    entity.partitionKey !== DELIVERY_ID_PARTITION_KEY ||
    record.deliveryId !== entity.rowKey
  ) {
    throw new Error("Stored ministry email delivery identity does not match its table keys");
  }
  return record;
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
}
