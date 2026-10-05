import {
  createHash
} from "node:crypto";
import type {
  TableClient
} from "@azure/data-tables";
import type {
  PersistedMinistryEmailProviderEvidenceV1
} from "../contracts/ministryEmailProviderEvidencePersistence.v1";
import {
  MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
  MINISTRY_EMAIL_DELIVERIES_TABLE_NAME
} from "./ministryEmailDeliveriesRepository";
import {
  getTableClient
} from "../storage/tableClient";

const ROW_PREFIX =
  "PROVIDER_EVIDENCE:";

type ProviderEvidenceEntity = {
  partitionKey: string;
  rowKey: string;
  evidenceJson: string;
};

export interface MinistryEmailProviderEvidenceRepository {
  read(
    provider: "sendgrid",
    evidenceId: string
  ): Promise<PersistedMinistryEmailProviderEvidenceV1 | null>;

  create(
    record: PersistedMinistryEmailProviderEvidenceV1
  ): Promise<boolean>;
}

function identityHash(
  provider: "sendgrid",
  evidenceId: string
): string {
  return createHash("sha256")
    .update(
      `${provider}:${evidenceId}`,
      "utf8"
    )
    .digest("hex");
}

export function ministryEmailProviderEvidenceRowKey(
  provider: "sendgrid",
  evidenceId: string
): string {
  return `${ROW_PREFIX}${identityHash(
    provider,
    evidenceId
  )}`;
}

function status(
  error: unknown
): number {
  const value = error as {
    statusCode?: unknown;
    status?: unknown;
  } | null;

  return Number(
    value?.statusCode ??
    value?.status ??
    0
  );
}

function code(
  error: unknown
): string {
  return String(
    (
      error as {
        code?: unknown;
      } | null
    )?.code ??
    ""
  );
}

function isNotFound(
  error: unknown
): boolean {
  return status(error) === 404 ||
    code(error) === "ResourceNotFound";
}

function isConflict(
  error: unknown
): boolean {
  return status(error) === 409 ||
    code(error) === "EntityAlreadyExists";
}

function parse(
  entity: ProviderEvidenceEntity,
  provider: "sendgrid",
  evidenceId: string
): PersistedMinistryEmailProviderEvidenceV1 {
  const record = JSON.parse(
    entity.evidenceJson
  ) as PersistedMinistryEmailProviderEvidenceV1;

  const expectedRowKey =
    ministryEmailProviderEvidenceRowKey(
      provider,
      evidenceId
    );

  if (
    entity.partitionKey !==
      MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY ||
    entity.rowKey !== expectedRowKey ||
    record.provider !== provider ||
    record.evidenceId !== evidenceId
  ) {
    throw new Error(
      "Stored ministry email provider evidence identity mismatch"
    );
  }

  return record;
}

export class AzureMinistryEmailProviderEvidenceRepository
implements MinistryEmailProviderEvidenceRepository {
  constructor(
    private readonly tableFactory:
      () => Promise<TableClient> =
        () =>
          getTableClient(
            MINISTRY_EMAIL_DELIVERIES_TABLE_NAME
          )
  ) {}

  async read(
    provider: "sendgrid",
    evidenceId: string
  ): Promise<PersistedMinistryEmailProviderEvidenceV1 | null> {
    const table = await this.tableFactory();

    const rowKey =
      ministryEmailProviderEvidenceRowKey(
        provider,
        evidenceId
      );

    try {
      const entity =
        await table.getEntity<ProviderEvidenceEntity>(
          MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
          rowKey
        );

      return parse(
        entity,
        provider,
        evidenceId
      );
    } catch (error) {
      if (isNotFound(error)) {
        return null;
      }

      throw error;
    }
  }

  async create(
    record: PersistedMinistryEmailProviderEvidenceV1
  ): Promise<boolean> {
    const table = await this.tableFactory();

    try {
      await table.createEntity<ProviderEvidenceEntity>({
        partitionKey:
          MINISTRY_EMAIL_DELIVERIES_PARTITION_KEY,
        rowKey:
          ministryEmailProviderEvidenceRowKey(
            record.provider,
            record.evidenceId
          ),
        evidenceJson:
          JSON.stringify(record)
      });

      return true;
    } catch (error) {
      if (isConflict(error)) {
        return false;
      }

      throw error;
    }
  }
}