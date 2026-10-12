import {
  type TableClient,
  type TransactionAction
} from "@azure/data-tables";
import { normalizeEntraStaffBinding } from "../domain/staff/projectStaffDirectory";

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
  etag?: string;
};

type StoredBinding = {
  staffId: string;
  tenantId: string;
  objectId: string;
  operationId: string;
  ownershipState?: string;
  releasedByStaffId?: string;
  releaseOperationId?: string;
  releaseRevision?: number;
  etag?: string;
};

type BindingState = "active" | "released";

export type BindingReservationRequest = Readonly<{
  tenantId: string;
  objectId: string;
  staffId: string;
  operationId: string;
}>;

export type BindingOwnershipReleaseRequest = Readonly<{
  tenantId: string;
  objectId: string;
  expectedStaffId: string;
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

export type BindingOwnershipReleaseResult =
  BindingReservationResult;

const nonAuthorizing = {
  executionPermitted: false,
  retryPermitted: false
} as const;

function normalizedGuid(value: unknown): string | null {
  const normalized = normalizeEntraStaffBinding(value, value);
  return normalized?.entraTenantId ?? null;
}

function normalizedStaffId(value: unknown): string | null {
  const staffId = String(value ?? "").trim();

  return staffId &&
    staffId.length <= 128 &&
    /^[a-zA-Z0-9_-]+$/.test(staffId)
    ? staffId
    : null;
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

function isValidETag(etag: unknown): etag is string {
  return typeof etag === "string" && Boolean(etag) && etag !== "*";
}

function isValidHead(head: StoredHead): boolean {
  return Number.isSafeInteger(head.revision) &&
    head.revision >= 0 &&
    (head.state === "active" || head.state === "revoked") &&
    isValidETag(head.etag);
}

function canTransition(head: StoredHead): boolean {
  return isValidHead(head) &&
    head.state === "active" &&
    head.revision < Number.MAX_SAFE_INTEGER;
}

function isValidBinding(
  binding: StoredBinding,
  tenantId: string,
  objectId: string
): boolean {
  return normalizedGuid(binding.tenantId) === tenantId &&
    normalizedGuid(binding.objectId) === objectId &&
    binding.tenantId === tenantId &&
    binding.objectId === objectId &&
    normalizedStaffId(binding.staffId) === binding.staffId &&
    normalizedGuid(binding.operationId) === binding.operationId &&
    (binding.ownershipState === undefined ||
      binding.ownershipState === "active" ||
      binding.ownershipState === "released") &&
    (binding.ownershipState === "released"
      ? normalizedStaffId(binding.releasedByStaffId) ===
        binding.releasedByStaffId &&
        normalizedGuid(binding.releaseOperationId) ===
          binding.releaseOperationId &&
        Number.isSafeInteger(binding.releaseRevision) &&
        (binding.releaseRevision ?? 0) > 0
      : binding.releasedByStaffId === undefined &&
        binding.releaseOperationId === undefined &&
        binding.releaseRevision === undefined) &&
    isValidETag(binding.etag);
}

function bindingState(binding: StoredBinding): BindingState {
  return binding.ownershipState === "released"
    ? "released"
    : "active";
}

function unavailable(): BindingReservationResult {
  return {
    status: "unavailable",
    ...nonAuthorizing
  };
}

function conflict(): BindingReservationResult {
  return {
    status: "conflict",
    ...nonAuthorizing
  };
}

function invalidInput(): BindingReservationResult {
  return {
    status: "invalid_input",
    ...nonAuthorizing
  };
}

function uncertain(): BindingReservationResult {
  return {
    status: "uncertain",
    ...nonAuthorizing
  };
}

function validRequest(
  request: BindingReservationRequest | BindingOwnershipReleaseRequest
): {
  tenantId: string;
  objectId: string;
  staffId: string;
  operationId: string;
} | null {
  const tenantId = normalizedGuid(request.tenantId);
  const objectId = normalizedGuid(request.objectId);
  const operationId = normalizedGuid(request.operationId);
  const rawStaffId = "staffId" in request
    ? request.staffId
    : request.expectedStaffId;
  const staffId = normalizedStaffId(rawStaffId);

  if (!tenantId || !objectId || !operationId || !staffId) {
    return null;
  }

  return { tenantId, objectId, staffId, operationId };
}

function transactionActions(
  head: StoredHead,
  actions: TransactionAction[]
): { actions: TransactionAction[]; revision: number } | null {
  if (!canTransition(head)) {
    return null;
  }

  const nextRevision = head.revision + 1;

  return {
    revision: nextRevision,
    actions: [
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
      ...actions
    ]
  };
}

export type ReservationEvidence = Readonly<{
  status:
    | "observed_consistent"
    | "observed_historical"
    | "absent_or_unavailable"
    | "inconsistent";
  executionPermitted: false;
  retryPermitted: false;
}>;

export class OAuthStaffSecurityStorageRepository {
  constructor(private readonly table: TableClient) {}

  /**
   * Read-only historical evidence inspection. It never
   * authorizes execution, retries, recovery writes, or a staff
   * security decision. A historical receipt does not prove
   * current binding ownership.
   *
   * A consistent read is not an atomic multi-entity snapshot.
   * It must not be used as a production authorization fence.
   */
  async inspectReservation(
    request: BindingReservationRequest
  ): Promise<ReservationEvidence> {
    const parsed = validRequest(request);

    if (!parsed) {
      return {
        status: "inconsistent",
        ...nonAuthorizing
      };
    }

    const { tenantId, objectId, staffId, operationId } = parsed;
    let receipt: {
      operationId: string;
      staffId: string;
      tenantId?: string;
      objectId?: string;
      kind: string;
      revision: number;
    };

    try {
      receipt = await this.table.getEntity(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `operation-${operationId}`
      );
    } catch {
      return {
        status: "absent_or_unavailable",
        ...nonAuthorizing
      };
    }

    let head: StoredHead;

    try {
      head = await this.table.getEntity<StoredHead>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );
    } catch {
      return {
        status: "absent_or_unavailable",
        ...nonAuthorizing
      };
    }

    const validReceipt =
      receipt.operationId === operationId &&
      receipt.staffId === staffId &&
      (receipt.tenantId === undefined || receipt.tenantId === tenantId) &&
      (receipt.objectId === undefined || receipt.objectId === objectId) &&
      receipt.kind === "binding.reserved" &&
      Number.isSafeInteger(receipt.revision) &&
      receipt.revision > 0;

    if (
      !validReceipt ||
      !isValidHead(head) ||
      head.revision < receipt.revision
    ) {
      return {
        status: "inconsistent",
        ...nonAuthorizing
      };
    }

    let binding: StoredBinding;

    try {
      binding = await this.table.getEntity<StoredBinding>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        `binding-${tenantId}-${objectId}`
      );
    } catch (error) {
      if (storageStatus(error) === 404) {
        return {
          status: "observed_historical",
          ...nonAuthorizing
        };
      }

      return {
        status: "absent_or_unavailable",
        ...nonAuthorizing
      };
    }

    if (!isValidBinding(binding, tenantId, objectId)) {
      return {
        status: "inconsistent",
        ...nonAuthorizing
      };
    }

    return {
      status:
        bindingState(binding) === "active" &&
        binding.staffId === staffId &&
        binding.operationId === operationId
          ? "observed_consistent"
          : "observed_historical",
      ...nonAuthorizing
    };
  }

  async reserveBinding(
    request: BindingReservationRequest
  ): Promise<BindingReservationResult> {
    const parsed = validRequest(request);

    if (!parsed) {
      return invalidInput();
    }

    const { tenantId, objectId, staffId, operationId } = parsed;
    const bindingRow = `binding-${tenantId}-${objectId}`;
    let head: StoredHead;

    try {
      head = await this.table.getEntity<StoredHead>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );
    } catch {
      return unavailable();
    }

    if (!canTransition(head)) {
      return unavailable();
    }

    let existingBinding: StoredBinding | null = null;

    try {
      existingBinding = await this.table.getEntity<StoredBinding>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        bindingRow
      );
    } catch (error) {
      if (storageStatus(error) !== 404) {
        return unavailable();
      }
    }

    let bindingAction: TransactionAction;
    if (existingBinding) {
      if (!isValidBinding(existingBinding, tenantId, objectId)) {
        return unavailable();
      }

      if (bindingState(existingBinding) === "active") {
        return conflict();
      }

      bindingAction = [
        "update",
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: bindingRow,
          staffId,
          tenantId,
          objectId,
          operationId,
          ownershipState: "active"
        },
        "Replace",
        { etag: existingBinding.etag }
      ];
    } else {
      bindingAction = [
        "create",
        {
          partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
          rowKey: bindingRow,
          staffId,
          tenantId,
          objectId,
          operationId,
          ownershipState: "active"
        }
      ];
    }

    const transition = transactionActions(head, [bindingAction]);

    if (!transition) {
      return unavailable();
    }

    transition.actions.push([
      "create",
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: `operation-${operationId}`,
        operationId,
        staffId,
        tenantId,
        objectId,
        kind: "binding.reserved",
        revision: transition.revision
      }
    ]);

    return this.submitTransition(transition.actions, transition.revision);
  }

  /**
   * Releases a binding only while the stored owner still matches
   * expectedStaffId. The head and binding ETags fence concurrent
   * transitions; the immutable receipt is committed atomically.
   */
  async releaseBindingOwnership(
    request: BindingOwnershipReleaseRequest
  ): Promise<BindingOwnershipReleaseResult> {
    const parsed = validRequest(request);

    if (!parsed) {
      return invalidInput();
    }

    const { tenantId, objectId, staffId, operationId } = parsed;
    const bindingRow = `binding-${tenantId}-${objectId}`;
    let head: StoredHead;

    try {
      head = await this.table.getEntity<StoredHead>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        STAFF_SECURITY_HEAD_ROW
      );
    } catch {
      return unavailable();
    }

    if (!canTransition(head)) {
      return unavailable();
    }

    let binding: StoredBinding;

    try {
      binding = await this.table.getEntity<StoredBinding>(
        STAFF_SECURITY_PROTOTYPE_PARTITION,
        bindingRow
      );
    } catch (error) {
      return storageStatus(error) === 404 ? conflict() : unavailable();
    }

    if (!isValidBinding(binding, tenantId, objectId)) {
      return unavailable();
    }

    if (
      binding.staffId !== staffId ||
      bindingState(binding) !== "active"
    ) {
      return conflict();
    }

    const updateBindingAction: TransactionAction = [
      "update",
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: bindingRow,
        staffId: binding.staffId,
        tenantId,
        objectId,
        operationId: binding.operationId,
        ownershipState: "released",
        releasedByStaffId: staffId,
        releaseOperationId: operationId,
        releaseRevision: head.revision + 1
      },
      "Replace",
      { etag: binding.etag }
    ];
    const transition = transactionActions(head, [
      updateBindingAction
    ]);

    if (!transition) {
      return unavailable();
    }

    transition.actions.push([
      "create",
      {
        partitionKey: STAFF_SECURITY_PROTOTYPE_PARTITION,
        rowKey: `operation-${operationId}`,
        operationId,
        staffId,
        tenantId,
        objectId,
        kind: "binding.released",
        revision: transition.revision
      }
    ]);

    return this.submitTransition(transition.actions, transition.revision);
  }

  private async submitTransition(
    actions: TransactionAction[],
    revision: number
  ): Promise<BindingReservationResult> {
    try {
      await this.table.submitTransaction(actions);

      return {
        status: "committed",
        revision,
        ...nonAuthorizing
      };
    } catch (error) {
      const status = storageStatus(error);

      if (status === 409 || status === 412) {
        return conflict();
      }

      // Unknown acknowledgements are never retried or inferred
      // as successful operations.
      return uncertain();
    }
  }
}
