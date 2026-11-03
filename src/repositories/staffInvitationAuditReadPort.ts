import type { TableClient } from "@azure/data-tables";

import {
  STAFF_INVITATION_AUDIT_PARTITION
} from "./staffInvitationAuditTableRecorderPrototype";

import type {
  AuditReadbackPort,
  AuditReadbackRequest
} from "../services/staff/inspectStaffInvitationAuditReadback";

type ReadOnlyAuditTable = Pick<TableClient, "listEntities">;

const uuidV4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const staffIdPattern =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

/**
 * Isolated C6 read-only Azure Table adapter.
 *
 * Accepts a client constructed by trusted backend code.
 * Does not create or configure a client, ensure tables,
 * read environment variables, write records, or retry.
 *
 * This is not evidence of resource identity, least privilege,
 * read completeness beyond the query, or Azure durability.
 */
export function createStaffInvitationAuditReadPort(
  table: ReadOnlyAuditTable
): AuditReadbackPort {
  return Object.freeze({
    async readRows(
      request: AuditReadbackRequest
    ): Promise<readonly unknown[]> {
      if (
        !request ||
        typeof request.operationId !== "string" ||
        !uuidV4.test(request.operationId) ||
        typeof request.actorCorrelationId !== "string" ||
        !uuid.test(request.actorCorrelationId) ||
        typeof request.canonicalStaffId !== "string" ||
        !staffIdPattern.test(request.canonicalStaffId) ||
        (request.action !== "create" &&
          request.action !== "read")
      ) {
        throw new Error("Audit read request rejected");
      }

      // Operation and correlation IDs are validated before
      // incorporation into the Azure Tables OData filter.
      //
      // Query every audit record for this operation.
      // Do not filter by actor correlation, canonical staff ID,
      // action or phase: conflicting values must remain visible.
      const filter =
        `PartitionKey eq '${STAFF_INVITATION_AUDIT_PARTITION}'` +
        ` and operationId eq '${request.operationId}'`;

      const rows: unknown[] = [];

      // Full iteration is required for zero, one, or two rows.
      // Three records establish a contradiction: the inspector
      // rejects the returned collection.
      //
      // Iterator failures propagate to the inspector, which
      // classifies the read as unavailable, not successful.
      for await (
        const entity of table.listEntities<Record<string, unknown>>({
          queryOptions: { filter }
        })
      ) {
        rows.push(entity);

        if (rows.length === 3) {
          break;
        }
      }

      return Object.freeze(rows);
    }
  });
}
