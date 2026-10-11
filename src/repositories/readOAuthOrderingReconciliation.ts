import type {
  OAuthOrderingCommand,
  OAuthOrderingSnapshot
} from "../services/authorization/modelOAuthRevocationOrdering";

import {
  inspectOAuthOrderingReconciliation,
  type OAuthOrderingReconciliationResult
} from "../services/authorization/inspectOAuthOrderingReconciliation";

import {
  OAUTH_ORDERING_PARTITION_KEY,
  type OAuthOrderingTableEntity,
  type OAuthOrderingTablePort
} from "./oauthOrderingCoordinationRepository";

/**
 * Read-only adapter over an injected, trusted table client.
 *
 * The caller cannot supply observed storage evidence.
 * No updates, provisioning, retries or credential operations.
 *
 * The table port must be wired by trusted infrastructure.
 * A successful read does not prove exact attempt identity.
 */
export class OAuthOrderingReconciliationReader {
  constructor(
    private readonly table: Pick<OAuthOrderingTablePort, "getEntity">
  ) {}

  async inspect(
    coordinationId: string,
    before: Readonly<OAuthOrderingSnapshot>,
    command: Readonly<OAuthOrderingCommand>
  ): Promise<OAuthOrderingReconciliationResult> {
    const unresolved = () =>
      inspectOAuthOrderingReconciliation(
        coordinationId, before, command, null
      );

    // Validate request through the pure evaluator before
    // accessing storage. Untrusted baseline cannot be used
    // to establish authenticity or execution permission.
    const preliminary = inspectOAuthOrderingReconciliation(
      coordinationId, before, command, before
    );

    if (
      preliminary.status === "unresolved" ||
      !this.table ||
      typeof this.table.getEntity !== "function"
    ) {
      return unresolved();
    }

    let entity: OAuthOrderingTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_ORDERING_PARTITION_KEY,
        coordinationId
      );
    } catch {
      return unresolved();
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
      return unresolved();
    }

    let observed: unknown;

    try {
      observed = JSON.parse(entity.snapshotJson);
    } catch {
      return unresolved();
    }

    return inspectOAuthOrderingReconciliation(
      coordinationId,
      before,
      command,
      observed
    );
  }
}
