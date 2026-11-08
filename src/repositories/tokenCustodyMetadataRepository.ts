import {
  modelTokenCustodyTransition,
  type TokenCustodyCommand,
  type TokenCustodySnapshot,
} from "../services/authorization/modelTokenCustodyTransition";

/**
 * Metadata-only storage prototype.
 *
 * No credential fields, SDK construction, live table access,
 * deployment, authorization verification, or refresh execution.
 *
 * An injected trusted port must enforce exact ETag conditions.
 * This repository does not prove cross-record atomicity.
 */

export const TOKEN_CUSTODY_PARTITION_KEY = "token-custody-metadata-v1";

export type TokenCustodyTableEntity = Readonly<{
  partitionKey: string;
  rowKey: string;
  snapshotJson: string;
  etag: string;
}>;

export type TokenCustodyWriteEntity = Pick<
  TokenCustodyTableEntity,
  "partitionKey" | "rowKey" | "snapshotJson"
>;

export interface TokenCustodyTablePort {
  getEntity(
    partitionKey: string,
    rowKey: string,
  ): Promise<TokenCustodyTableEntity>;

  updateEntity(
    entity: TokenCustodyWriteEntity,
    mode: "Replace",
    options: { etag: string },
  ): Promise<unknown>;
}

export type TokenCustodyStorageResult =
  | Readonly<{
      outcome: "committed";
      next: TokenCustodySnapshot;
      executionPermitted: false;
    }>
  | Readonly<{
      outcome: "denied";
      executionPermitted: false;
      retryPermitted: false;
    }>
  | Readonly<{
      outcome: "uncertain";
      executionPermitted: false;
      retryPermitted: false;
    }>;

const RECORD_ID = /^[A-Za-z0-9_-]{1,128}$/;

function denied(): TokenCustodyStorageResult {
  return {
    outcome: "denied",
    executionPermitted: false,
    retryPermitted: false,
  };
}

function uncertain(): TokenCustodyStorageResult {
  return {
    outcome: "uncertain",
    executionPermitted: false,
    retryPermitted: false,
  };
}

function knownConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };

  const status = Number(value.statusCode ?? value.status ?? 0);
  const code = String(value.code ?? "");

  return (
    status === 404 ||
    status === 409 ||
    status === 412 ||
    code === "ResourceNotFound" ||
    code === "EntityNotFound" ||
    code === "UpdateConditionNotSatisfied" ||
    code === "ConditionNotMet"
  );
}

export class TokenCustodyMetadataRepository {
  constructor(private readonly table: TokenCustodyTablePort) {}

  async tryTransition(
    recordId: string,
    command: Readonly<TokenCustodyCommand>,
  ): Promise<TokenCustodyStorageResult> {
    if (
      typeof recordId !== "string" ||
      !RECORD_ID.test(recordId) ||
      !command ||
      command.executionEnabled !== true ||
      command.authorized !== true ||
      !this.table ||
      typeof this.table.getEntity !== "function" ||
      typeof this.table.updateEntity !== "function"
    ) {
      return denied();
    }

    let entity: TokenCustodyTableEntity;

    try {
      entity = await this.table.getEntity(
        TOKEN_CUSTODY_PARTITION_KEY,
        recordId,
      );
    } catch (error) {
      return knownConflict(error) ? denied() : uncertain();
    }

    if (
      !entity ||
      entity.partitionKey !== TOKEN_CUSTODY_PARTITION_KEY ||
      entity.rowKey !== recordId ||
      typeof entity.etag !== "string" ||
      !entity.etag.trim() ||
      entity.etag.trim() === "*" ||
      typeof entity.snapshotJson !== "string"
    ) {
      return denied();
    }

    let snapshot: TokenCustodySnapshot;

    try {
      snapshot = JSON.parse(entity.snapshotJson) as TokenCustodySnapshot;
    } catch {
      return denied();
    }

    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      snapshot.recordId !== recordId
    ) {
      return denied();
    }

    const result = modelTokenCustodyTransition(snapshot, command);

    if (result.outcome !== "proposed") {
      return denied();
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: TOKEN_CUSTODY_PARTITION_KEY,
          rowKey: recordId,
          snapshotJson: JSON.stringify(result.next),
        },
        "Replace",
        { etag: entity.etag },
      );
    } catch (error) {
      // A failed acknowledgement may follow an actual commit.
      // Never automatically replay a custody write.
      return knownConflict(error) ? denied() : uncertain();
    }

    return {
      outcome: "committed",
      next: result.next,
      executionPermitted: false,
    };
  }
}