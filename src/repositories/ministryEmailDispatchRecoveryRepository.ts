import type {
  TableClient,
  TransactionAction
} from "@azure/data-tables";
import type {
  MinistryEmailDispatchRecoveryAuditV1
} from "../contracts/ministryEmailDispatchRecovery.v1";
import type {
  MinistryEmailDeliveryRecord
} from "../domain/communications/ministryEmailDeliveryContracts";
import {
  MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
  MINISTRY_EMAIL_DELIVERIES_TABLE_NAME
} from "./ministryEmailDeliveriesRepository";
import { getTableClient } from "../storage/tableClient";

const RECOVERY_ROW_PREFIX = "RECOVERY:";

type DeliveryEntity = {
  partitionKey: string;
  rowKey: string;
  deliveryJson: string;
  etag: string;
};

type RecoveryEntity = {
  partitionKey: string;
  rowKey: string;
  recoveryJson: string;
};

export type MinistryEmailDispatchRecoverySnapshot = {
  record: MinistryEmailDeliveryRecord;
  version: string;
};

export interface MinistryEmailDispatchRecoveryRepository {
  readDeliveryVersioned(
    deliveryId: string
  ): Promise<MinistryEmailDispatchRecoverySnapshot | null>;

  readRecovery(
    deliveryId: string,
    resolutionId: string
  ): Promise<MinistryEmailDispatchRecoveryAuditV1 | null>;

  resolveIfVersion(
    nextRecord: MinistryEmailDeliveryRecord,
    audit: MinistryEmailDispatchRecoveryAuditV1,
    expectedVersion: string
  ): Promise<boolean>;
}

function rowKey(deliveryId: string, resolutionId: string): string {
  return `${RECOVERY_ROW_PREFIX}${deliveryId}:${resolutionId}`;
}

function status(error: unknown): number {
  const value = error as {
    statusCode?: unknown;
    status?: unknown;
  } | null;

  return Number(value?.statusCode ?? value?.status ?? 0);
}

function code(error: unknown): string {
  const value = error as { code?: unknown } | null;
  return String(value?.code ?? "");
}

function isNotFound(error: unknown): boolean {
  return status(error) === 404 || code(error) === "ResourceNotFound";
}

function isConflict(error: unknown): boolean {
  return status(error) === 409 ||
    status(error) === 412 ||
    code(error) === "EntityAlreadyExists" ||
    code(error) === "UpdateConditionNotSatisfied";
}

function parseDelivery(entity: DeliveryEntity): MinistryEmailDeliveryRecord {
  const record = JSON.parse(entity.deliveryJson) as MinistryEmailDeliveryRecord;

  if (
    entity.partitionKey !== MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY ||
    record.deliveryId !== entity.rowKey
  ) {
    throw new Error("Stored ministry email delivery identity mismatch");
  }

  return {
    ...record,
    dispatchAttemptId: record.dispatchAttemptId ?? null,
    dispatchClaimedAt: record.dispatchClaimedAt ?? null
  };
}

export class AzureMinistryEmailDispatchRecoveryRepository
implements MinistryEmailDispatchRecoveryRepository {
  constructor(
    private readonly tableFactory:
      () => Promise<TableClient> =
        () => getTableClient(MINISTRY_EMAIL_DELIVERIES_TABLE_NAME)
  ) {}

  async readDeliveryVersioned(
    deliveryId: string
  ): Promise<MinistryEmailDispatchRecoverySnapshot | null> {
    const table = await this.tableFactory();

    try {
      const entity = await table.getEntity<DeliveryEntity>(
        MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
        deliveryId
      );

      if (!entity.etag) {
        throw new Error("Stored ministry email delivery missing ETag");
      }

      return {
        record: parseDelivery(entity),
        version: entity.etag
      };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async readRecovery(
    deliveryId: string,
    resolutionId: string
  ): Promise<MinistryEmailDispatchRecoveryAuditV1 | null> {
    const table = await this.tableFactory();

    try {
      const entity = await table.getEntity<RecoveryEntity>(
        MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
        rowKey(deliveryId, resolutionId)
      );

      const audit = JSON.parse(
        entity.recoveryJson
      ) as MinistryEmailDispatchRecoveryAuditV1;

      if (
        entity.partitionKey !== MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY ||
        audit.deliveryId !== deliveryId ||
        audit.resolutionId !== resolutionId
      ) {
        throw new Error("Stored ministry email recovery identity mismatch");
      }

      return audit;
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async resolveIfVersion(
    nextRecord: MinistryEmailDeliveryRecord,
    audit: MinistryEmailDispatchRecoveryAuditV1,
    expectedVersion: string
  ): Promise<boolean> {
    if (!expectedVersion.trim()) return false;

    if (
      nextRecord.deliveryId !== audit.deliveryId ||
      nextRecord.dispatchAttemptId !== audit.dispatchAttemptId ||
      (
        nextRecord.state !== "provider_accepted" &&
        nextRecord.state !== "failed"
      )
    ) {
      return false;
    }

    const table = await this.tableFactory();

    const actions: TransactionAction[] = [
      [
        "update",
        {
          partitionKey: MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
          rowKey: nextRecord.deliveryId,
          deliveryJson: JSON.stringify(nextRecord)
        },
        "Replace",
        { etag: expectedVersion }
      ],
      [
        "create",
        {
          partitionKey: MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
          rowKey: rowKey(audit.deliveryId, audit.resolutionId),
          recoveryJson: JSON.stringify(audit)
        }
      ]
    ];

    try {
      await table.submitTransaction(actions);
      return true;
    } catch (error) {
      if (isConflict(error)) return false;
      throw error;
    }
  }
}