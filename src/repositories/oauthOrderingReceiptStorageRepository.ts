import type {
  OAuthOrderingCommand
} from "../services/authorization/modelOAuthRevocationOrdering";

import {
  isOAuthOrderingReceiptEnvelope,
  modelOAuthOrderingReceiptTransition,
  type OAuthOrderingReceiptEnvelope
} from "../services/authorization/modelOAuthOrderingTransitionReceipts";

/**
 * Synthetic V2 coordination storage proof.
 *
 * A caller-provided attemptId is never generated here.
 * Trusted infrastructure must supply a unique opaque ID.
 *
 * V1 records are not accepted or migrated implicitly.
 * The entire V2 envelope is replaced as ONE entity using
 * the precise ETag returned by the trusted storage port.
 *
 * This adapter has no provisioning, runtime execution,
 * credential access or authorization capability.
 */
export const OAUTH_ORDERING_RECEIPT_PARTITION_KEY =
  "OAUTH_ORDERING_RECEIPTS_V2";

export interface OAuthOrderingReceiptTableEntity {
  partitionKey: string;
  rowKey: string;
  envelopeJson: string;
  etag: string;
}

export type OAuthOrderingReceiptWriteEntity = Pick<
  OAuthOrderingReceiptTableEntity,
  "partitionKey" | "rowKey" | "envelopeJson"
>;

export interface OAuthOrderingReceiptTablePort {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingReceiptTableEntity>;

  updateEntity(
    entity: OAuthOrderingReceiptWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown>;
}

export type OAuthOrderingReceiptStorageResult =
  | {
      outcome: "committed";
      next: OAuthOrderingReceiptEnvelope;
      retryPermitted: false;
      executionPermitted: false;
    }
  | {
      outcome: "denied";
      retryPermitted: false;
      executionPermitted: false;
    }
  | {
      outcome: "uncertain";
      retryPermitted: false;
      executionPermitted: false;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function knownDenial(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };

  const status = Number(value.statusCode ?? value.status ?? 0);
  const code = String(value.code ?? "");

  return status === 404 ||
    status === 412 ||
    code === "ResourceNotFound" ||
    code === "EntityNotFound" ||
    code === "UpdateConditionNotSatisfied";
}

function denied(): OAuthOrderingReceiptStorageResult {
  return {
    outcome: "denied",
    retryPermitted: false,
    executionPermitted: false
  };
}

function uncertain(): OAuthOrderingReceiptStorageResult {
  return {
    outcome: "uncertain",
    retryPermitted: false,
    executionPermitted: false
  };
}

export class OAuthOrderingReceiptStorageRepository {
  constructor(
    private readonly table: OAuthOrderingReceiptTablePort
  ) {}

  async tryTransition(
    coordinationId: string,
    attemptId: string,
    command: Readonly<OAuthOrderingCommand>
  ): Promise<OAuthOrderingReceiptStorageResult> {
    if (
      typeof coordinationId !== "string" ||
      !UUID.test(coordinationId) ||
      typeof attemptId !== "string" ||
      !UUID.test(attemptId) ||
      !this.table ||
      typeof this.table.getEntity !== "function" ||
      typeof this.table.updateEntity !== "function"
    ) {
      return denied();
    }

    let entity: OAuthOrderingReceiptTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
        coordinationId
      );
    } catch (error) {
      return knownDenial(error) ? denied() : uncertain();
    }

    if (
      !entity ||
      entity.partitionKey !==
        OAUTH_ORDERING_RECEIPT_PARTITION_KEY ||
      entity.rowKey !== coordinationId ||
      typeof entity.etag !== "string" ||
      !entity.etag.trim() ||
      entity.etag.trim() === "*" ||
      typeof entity.envelopeJson !== "string"
    ) {
      return denied();
    }

    let stored: unknown;

    try {
      stored = JSON.parse(entity.envelopeJson);
    } catch {
      return denied();
    }

    if (!isOAuthOrderingReceiptEnvelope(stored)) {
      return denied();
    }

    const decision = modelOAuthOrderingReceiptTransition(
      stored, attemptId, command
    );

    if (!decision.accepted) {
      return denied();
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: entity.partitionKey,
          rowKey: entity.rowKey,
          envelopeJson: JSON.stringify(decision.next)
        },
        "Replace",
        { etag: entity.etag }
      );
    } catch (error) {
      // A lost acknowledgement may follow a real commit.
      // Never retry automatically or infer success.
      return knownDenial(error) ? denied() : uncertain();
    }

    return {
      outcome: "committed",
      next: decision.next,
      retryPermitted: false,
      executionPermitted: false
    };
  }
}
