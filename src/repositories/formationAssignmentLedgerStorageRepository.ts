import {
  type TableClient,
  type TransactionAction
} from "@azure/data-tables";
import {
  validateFormationAssignmentLedgerRequest,
  nonAuthorizingAssignmentLedgerResult,
  type FormationAssignmentLedgerResult
} from "../services/authorization/formationAssignmentLedgerContract";

/**
 * Non-authorizing assignment-ledger storage foundation.
 *
 * The caller injects the TableClient. This class never creates a table,
 * discovers credentials, invokes an HTTP route, or modifies existing
 * formation events/profiles.
 *
 * Each visitor is a separate partition in the injected ledger table.
 * A transaction updates one ordering head and creates one immutable
 * operation receipt in the SAME partition.
 *
 * This is storage feasibility only. It does NOT establish complete
 * writer participation, historical reconciliation, a trustworthy
 * authorization snapshot, or permission to access visitor records.
 */

const HEAD_ROW = "ordering-head";

type LedgerHead = {
  visitorId?: string;
  revision?: number;
  kind?: string;
  assigneeId?: string;
  lastOperationId?: string;
  etag?: string;
};

function storageStatus(error: unknown): number {
  if (!error || typeof error !== "object") {
    return 0;
  }

  try {
    const candidate = error as {
      statusCode?: unknown;
    };

    return typeof candidate.statusCode === "number"
      ? candidate.statusCode
      : 0;
  } catch {
    return 0;
  }
}

function validHead(
  head: LedgerHead,
  visitorId: string
): head is LedgerHead & {
  revision: number;
  etag: string;
} {
  return head.visitorId === visitorId &&
    Number.isSafeInteger(head.revision) &&
    typeof head.revision === "number" &&
    head.revision > 0 &&
    head.revision <= Number.MAX_SAFE_INTEGER &&
    (
      (head.kind === "assigned" &&
        typeof head.assigneeId === "string" &&
        /^[A-Za-z0-9_-]{1,128}$/.test(head.assigneeId)) ||
      (head.kind === "unassigned" && head.assigneeId === "")
    ) &&
    typeof head.lastOperationId === "string" &&
    /^[A-Za-z0-9_-]{1,128}$/.test(head.lastOperationId) &&
    typeof head.etag === "string" &&
    head.etag.length > 0 &&
    head.etag !== "*";
}

export class FormationAssignmentLedgerStorageRepository {
  constructor(private readonly table: TableClient) {}

  /**
   * Historical, read-only evidence inspection.
   *
   * Two entity reads are NOT an atomic snapshot.
   * Even observed_current does not establish completeness,
   * writer participation, or permission to authorize access.
   * This method never writes, retries, or repairs storage.
   */
  async inspectOperation(request: unknown): Promise<Readonly<{
    status:
      | "observed_current"
      | "observed_historical"
      | "absent_or_unavailable"
      | "inconsistent";
    authorizationPermitted: false;
    retryPermitted: false;
  }>> {
    const evidence = (
      status:
        | "observed_current"
        | "observed_historical"
        | "absent_or_unavailable"
        | "inconsistent"
    ) => ({
      status,
      authorizationPermitted: false as const,
      retryPermitted: false as const
    });

    const parsed = validateFormationAssignmentLedgerRequest(request);

    if (!parsed) {
      return evidence("inconsistent");
    }

    const { visitorId, operationId, expectedRevision, kind, assigneeId } =
      parsed;

    let receipt: {
      visitorId?: string;
      operationId?: string;
      expectedRevision?: number;
      revision?: number;
      kind?: string;
      assigneeId?: string;
    };

    try {
      receipt = await this.table.getEntity(
        visitorId,
        `operation-${operationId}`
      );
    } catch {
      return evidence("absent_or_unavailable");
    }

    const validReceipt =
      receipt.visitorId === visitorId &&
      receipt.operationId === operationId &&
      receipt.expectedRevision === expectedRevision &&
      receipt.kind === kind &&
      receipt.assigneeId === (assigneeId ?? "") &&
      Number.isSafeInteger(receipt.revision) &&
      receipt.revision === expectedRevision + 1;

    if (!validReceipt) {
      return evidence("inconsistent");
    }

    let head: LedgerHead;

    try {
      head = await this.table.getEntity<LedgerHead>(
        visitorId,
        HEAD_ROW
      );
    } catch {
      return evidence("absent_or_unavailable");
    }

    if (!validHead(head, visitorId) ||
        head.revision < (receipt.revision as number)) {
      return evidence("inconsistent");
    }

    if (head.revision > (receipt.revision as number)) {
      return evidence("observed_historical");
    }

    if (head.lastOperationId !== operationId ||
        head.kind !== kind ||
        head.assigneeId !== (assigneeId ?? "")) {
      return evidence("inconsistent");
    }

    return evidence("observed_current");
  }
  async append(request: unknown): Promise<FormationAssignmentLedgerResult> {
    const parsed = validateFormationAssignmentLedgerRequest(request);

    if (!parsed) {
      return nonAuthorizingAssignmentLedgerResult("invalid_input");
    }

    const {
      visitorId,
      operationId,
      expectedRevision,
      kind,
      assigneeId
    } = parsed;

    const operationRow = `operation-${operationId}`;

    // Inspect the immutable receipt before attempting a write.
    // Its presence is replay evidence, NOT authorization evidence.
    try {
      await this.table.getEntity(visitorId, operationRow);
      return nonAuthorizingAssignmentLedgerResult("replay");
    } catch (error) {
      if (storageStatus(error) !== 404) {
        return nonAuthorizingAssignmentLedgerResult("unavailable");
      }
    }

    let head: LedgerHead | null = null;

    try {
      head = await this.table.getEntity<LedgerHead>(
        visitorId,
        HEAD_ROW
      );
    } catch (error) {
      if (storageStatus(error) !== 404) {
        return nonAuthorizingAssignmentLedgerResult("unavailable");
      }
    }

    let nextRevision: number;
    let headAction: TransactionAction;

    if (head === null) {
      // First write must atomically create both the head and receipt.
      // There is no separately committed empty initialization state.
      if (expectedRevision !== 0) {
        return nonAuthorizingAssignmentLedgerResult("conflict");
      }

      nextRevision = 1;
      headAction = [
        "create",
        {
          partitionKey: visitorId,
          rowKey: HEAD_ROW,
          visitorId,
          revision: nextRevision,
          kind,
          assigneeId: assigneeId ?? "",
          lastOperationId: operationId
        }
      ];
    } else {
      if (!validHead(head, visitorId)) {
        return nonAuthorizingAssignmentLedgerResult("unavailable");
      }

      if (head.revision !== expectedRevision) {
        return nonAuthorizingAssignmentLedgerResult("conflict");
      }

      nextRevision = head.revision + 1;

      headAction = [
        "update",
        {
          partitionKey: visitorId,
          rowKey: HEAD_ROW,
          visitorId,
          revision: nextRevision,
          kind,
          assigneeId: assigneeId ?? "",
          lastOperationId: operationId
        },
        "Replace",
        { etag: head.etag }
      ];
    }

    const receiptAction: TransactionAction = [
      "create",
      {
        partitionKey: visitorId,
        rowKey: operationRow,
        visitorId,
        operationId,
        expectedRevision,
        revision: nextRevision,
        kind,
        assigneeId: assigneeId ?? ""
      }
    ];

    try {
      await this.table.submitTransaction([
        headAction,
        receiptAction
      ]);

      // Only a directly acknowledged transaction returns committed.
      // This result still NEVER authorizes visitor access.
      return nonAuthorizingAssignmentLedgerResult(
        "committed",
        nextRevision
      );
    } catch (error) {
      const status = storageStatus(error);

      if (status === 409 || status === 412) {
        return nonAuthorizingAssignmentLedgerResult("conflict");
      }

      // A missing acknowledgement is not proof of failure.
      // Do not automatically retry or claim a successful write.
      return nonAuthorizingAssignmentLedgerResult("uncertain");
    }
  }
}