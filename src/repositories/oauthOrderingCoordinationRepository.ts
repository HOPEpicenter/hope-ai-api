import {
  modelOAuthRevocationOrdering,
  type OAuthOrderingCommand,
  type OAuthOrderingSnapshot
} from "../services/authorization/modelOAuthRevocationOrdering";

/**
 * Isolated OAuth ordering storage proof.
 *
 * The table is injected. No provisioning, credentials,
 * runtime wiring, OAuth execution or staff writes occur here.
 *
 * Single-winner semantics apply to conditional updates of
 * one existing entity, only when storage honors If-Match.
 *
 * This is NOT an end-to-end authorization/revocation fence.
 */
export const OAUTH_ORDERING_PARTITION_KEY =
  "OAUTH_ORDERING_PROOF_V1";

export interface OAuthOrderingTableEntity {
  partitionKey: string;
  rowKey: string;
  snapshotJson: string;
  etag: string;
}

export type OAuthOrderingWriteEntity = Pick<
  OAuthOrderingTableEntity,
  "partitionKey" | "rowKey" | "snapshotJson"
>;

export interface OAuthOrderingTablePort {
  getEntity(
    partitionKey: string,
    rowKey: string
  ): Promise<OAuthOrderingTableEntity>;

  updateEntity(
    entity: OAuthOrderingWriteEntity,
    mode: "Replace",
    options: { etag: string }
  ): Promise<unknown>;
}

export type OAuthOrderingStorageResult =
  | {
      outcome: "committed";
      next: OAuthOrderingSnapshot;
      executionPermitted: false;
    }
  | {
      outcome: "denied";
      executionPermitted: false;
    }
  | {
      outcome: "uncertain";
      executionPermitted: false;
    };

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function knownConflict(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const value = error as {
    statusCode?: unknown;
    status?: unknown;
    code?: unknown;
  };

  const status = Number(value.statusCode ?? value.status ?? 0);
  const code = String(value.code ?? "");

  return status === 404 ||
    status === 409 ||
    status === 412 ||
    code === "ResourceNotFound" ||
    code === "EntityNotFound" ||
    code === "UpdateConditionNotSatisfied";
}

const denied = (): OAuthOrderingStorageResult => ({
  outcome: "denied",
  executionPermitted: false
});

const uncertain = (): OAuthOrderingStorageResult => ({
  outcome: "uncertain",
  executionPermitted: false
});

/**
 * A successful acknowledgement confirms this entity update.
 * It does NOT authorize use of OAuth credentials.
 *
 * Unexpected read/write failures are uncertain, never grants.
 * A timed-out write may have committed before its error.
 * Do not blindly retry without reconciliation.
 */
export class OAuthOrderingCoordinationRepository {
  constructor(private readonly table: OAuthOrderingTablePort) {}

  async tryTransition(
    coordinationId: string,
    command: Readonly<OAuthOrderingCommand>
  ): Promise<OAuthOrderingStorageResult> {
    if (
      typeof coordinationId !== "string" ||
      !UUID.test(coordinationId) ||
      !this.table ||
      typeof this.table.getEntity !== "function" ||
      typeof this.table.updateEntity !== "function"
    ) {
      return denied();
    }

    let entity: OAuthOrderingTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_ORDERING_PARTITION_KEY,
        coordinationId
      );
    } catch (error) {
      return knownConflict(error) ? denied() : uncertain();
    }

    if (
      !entity ||
      entity.partitionKey !== OAUTH_ORDERING_PARTITION_KEY ||
      entity.rowKey !== coordinationId ||
      typeof entity.etag !== "string" ||
      !entity.etag.trim() ||
      entity.etag.trim() === "*" ||
      typeof entity.snapshotJson !== "string"
    ) {
      return denied();
    }

    let snapshot: unknown;

    try {
      snapshot = JSON.parse(entity.snapshotJson);
    } catch {
      return denied();
    }

    const decision = modelOAuthRevocationOrdering(
      snapshot,
      command
    );

    if (!decision.accepted) {
      return denied();
    }

    try {
      await this.table.updateEntity(
        {
          partitionKey: OAUTH_ORDERING_PARTITION_KEY,
          rowKey: coordinationId,
          snapshotJson: JSON.stringify(decision.next)
        },
        "Replace",
        { etag: entity.etag }
      );
    } catch (error) {
      return knownConflict(error) ? denied() : uncertain();
    }

    return {
      outcome: "committed",
      next: decision.next,
      executionPermitted: false
    };
  }
}
