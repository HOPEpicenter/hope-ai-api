import {
  type TableClient,
  type TransactionAction
} from "@azure/data-tables";

/**
 * Non-authorizing staff security storage foundation.
 *
 * The caller must explicitly inject a TableClient.
 * This repository does not create tables, connect to
 * production, modify StaffEvents, or grant OAuth access.
 *
 * Partition strategy remains provisional. The initial
 * shared partition is for isolated feasibility testing.
 */

export const STAFF_SECURITY_PROTOTYPE_PARTITION =
  "staff-security-prototype-v1";

export const STAFF_SECURITY_HEAD_ROW =
  "ordering-head";

type StoredHead = {
  revision: number;
  state: string;
};

export type BindingReservationRequest = Readonly<{
  tenantId: string;
  objectId: string;
  staffId: string;
  operationId: string;
}>;

export type BindingReservationResult =
  | Readonly<{
      status: "committed";
      revision: number;
      executionPermitted: false;
      retryPermitted: false;
    }>
  | Readonly<{
      status:
        | "invalid_input"
        | "unavailable"
        | "conflict"
        | "uncertain";
      executionPermitted: false;
      retryPermitted: false;
    }>;

const nonAuthorizing = {
  executionPermitted: false,
  retryPermitted: false
} as const;

function normalizedGuid(value: string): string | null {
  const text = String(value ?? "").trim().toLowerCase();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      text
    )
  ) {
    return null;
  }

  return text;
}

function storageStatus(error: unknown): number {
  if (!error || typeof error !== "object") {
    return 0;
  }

  const candidate = error as {
    statusCode?: unknown;
  };

  return typeof candidate.statusCode === "number"
    ? candidate.statusCode
    : 0;
}

function unavailable(): BindingReservationResult {
  return {
    status: "unavailable",
    ...nonAuthorizing
  };
}

export type ReservationEvidence = Readonly<{
  status: "observed_consistent" | "absent_or_unavailable" | "inconsistent";
  executionPermitted: false;
  retryPermitted: false;
}>;

export class OAuthStaffSecurityStorageRepository {
  constructor(private readonly table: TableClient) {}

  /**
   * Read-only evidence inspection. Never authorizes execution,
   * retries, recovery writes, or a staff security decision.
   *
   * A consistent read is not an atomic multi-entity snapshot.
   * It must not be used as a production authorization fence.
   */
  async inspectReservation(
    request: BindingReservationRequest
  ): Promise<ReservationEvidence> {
    const tenantId = normalizedGuid(request.tenantId);
    const objectId = normalizedGuid(request.objectId);
    const operationId = normalizedGuid(request.operationId);
    const staffId = String(request.staffId ?? "").trim();

    if (
      !tenantId ||
      !objectId ||
      !operationId ||
      !staffId ||
      staffId.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(staffId)
    ) {
      return {
        status: "inconsistent",
        ...nonAuthorizing
      };
    }

    try {
      const receipt = await this.table.getEntity<{
        operationId: string;
        staffId: string;
        kind: string;
        revision: number;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      );

      const binding = await this.table.getEntity<{
        staffId: string;
        tenantId: string;
        objectId: string;
        operationId: string;
      }>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `binding-${tenantId}-${objectId}`
      );

      const head = await this.table.getEntity<StoredHead>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );

      const consistent =
        receipt.operationId === operationId &&
        receipt.staffId === staffId &&
        receipt.kind === "binding.reserved" &&
        Number.isSafeInteger(receipt.revision) &&
        receipt.revision > 0 &&
        binding.staffId === staffId &&
        binding.tenantId === tenantId &&
        binding.objectId === objectId &&
        binding.operationId === operationId &&
        Number.isSafeInteger(head.revision) &&
        head.revision >= receipt.revision;

      return {
        status: consistent
          ? "observed_consistent"
          : "inconsistent",
        ...nonAuthorizing
      };
    } catch {
      // Includes missing records and read failures.
      // Never infer that the operation did not commit.
      return {
        status: "absent_or_unavailable",
        ...nonAuthorizing
      };
    }
  }

  async reserveBinding(
    request: BindingReservationRequest
  ): Promise<BindingReservationResult> {
    const tenantId = normalizedGuid(request.tenantId);
    const objectId = normalizedGuid(request.objectId);
    const operationId = normalizedGuid(request.operationId);
    const staffId = String(request.staffId ?? "").trim();

    if (
      !tenantId ||
      !objectId ||
      !operationId ||
      !staffId ||
      staffId.length > 128 ||
      !/^[a-zA-Z0-9_-]+$/.test(staffId)
    ) {
      return {
        status: "invalid_input",
        ...nonAuthorizing
      };
    }

    let head;

    try {
      head = await this.table.getEntity<StoredHead>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );
    } catch {
      return unavailable();
    }

    if (
      !Number.isSafeInteger(head.revision) ||
      head.revision < 0 ||
      head.state !== "active" ||
      !head.etag ||
      head.etag === "*"
    ) {
      return unavailable();
    }

    if (head.revision === Number.MAX_SAFE_INTEGER) {
      return unavailable();
    }

    const nextRevision = head.revision + 1;

    const actions: TransactionAction[] = [
      [
        "update",
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: STAFF_SECURITY_HEAD_ROW,
          revision: nextRevision,
          state: head.state
        },
        "Replace",
        { etag: head.etag }
      ],
      [
        "create",
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: `binding-${tenantId}-${objectId}`,
          staffId,
          tenantId,
          objectId,
          operationId
        }
      ],
      [
        "create",
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: `operation-${operationId}`,
          operationId,
          staffId,
          kind: "binding.reserved",
          revision: nextRevision
        }
      ]
    ];

    try {
      await this.table.submitTransaction(actions);

      return {
        status: "committed",
        revision: nextRevision,
        ...nonAuthorizing
      };
    } catch (error) {
      const status = storageStatus(error);

      if (status === 409 || status === 412) {
        return {
          status: "conflict",
          ...nonAuthorizing
        };
      }

      // Unknown acknowledgements are not automatically
      // retried or interpreted as successful operations.
      return {
        status: "uncertain",
        ...nonAuthorizing
      };
    }
  }
}
