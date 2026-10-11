import type {
  OAuthOrderingCommand,
  OAuthOrderingSnapshot
} from "../services/authorization/modelOAuthRevocationOrdering";

import {
  inspectOAuthOrderingReceiptReconciliation,
  type OAuthReceiptReconciliationResult
} from "../services/authorization/inspectOAuthOrderingReceiptReconciliation";

import {
  OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
  type OAuthOrderingReceiptTablePort,
  type OAuthOrderingReceiptTableEntity
} from "./oauthOrderingReceiptStorageRepository";

/**
 * Read-only inspection of isolated V2 receipt evidence.
 *
 * Trusted infrastructure must supply the table reader.
 * Callers cannot supply the observed storage envelope.
 *
 * This is not an OAuth authorization or execution adapter.
 * No writes, retries, provisioning or credential access.
 */
export class OAuthOrderingReceiptReconciliationReader {
  constructor(
    private readonly table:
      Pick<OAuthOrderingReceiptTablePort, "getEntity">
  ) {}

  async inspect(
    coordinationId: string,
    attemptId: string,
    before: Readonly<OAuthOrderingSnapshot>,
    command: Readonly<OAuthOrderingCommand>
  ): Promise<OAuthReceiptReconciliationResult> {
    const unresolved = () =>
      inspectOAuthOrderingReceiptReconciliation(
        coordinationId,
        attemptId,
        before,
        command,
        null
      );

    const uuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    if (
      typeof coordinationId !== "string" ||
      !uuid.test(coordinationId) ||
      typeof attemptId !== "string" ||
      !uuid.test(attemptId) ||
      !this.table ||
      typeof this.table.getEntity !== "function"
    ) {
      return unresolved();
    }

    let entity: OAuthOrderingReceiptTableEntity;

    try {
      entity = await this.table.getEntity(
        OAUTH_ORDERING_RECEIPT_PARTITION_KEY,
        coordinationId
      );
    } catch {
      return unresolved();
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
      return unresolved();
    }

    let observed: unknown;

    try {
      observed = JSON.parse(entity.envelopeJson);
    } catch {
      return unresolved();
    }

    return inspectOAuthOrderingReceiptReconciliation(
      coordinationId,
      attemptId,
      before,
      command,
      observed
    );
  }
}
