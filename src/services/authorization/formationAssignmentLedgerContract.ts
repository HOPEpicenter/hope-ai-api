/**
 * Non-authorizing formation assignment ledger foundation.
 *
 * This contract does not read storage, create tables, process HTTP requests,
 * mutate ministry data, or establish authorization completeness.
 *
 * Writer participation, historical reconciliation, and a verified storage
 * snapshot are prerequisites for any future authorization integration.
 */

export type FormationAssignmentLedgerOperationKind =
  | "assigned"
  | "unassigned";

export type FormationAssignmentLedgerRequest = Readonly<{
  visitorId: string;
  operationId: string;
  expectedRevision: number;
  kind: FormationAssignmentLedgerOperationKind;
  assigneeId?: string;
}>;

export type FormationAssignmentLedgerResultStatus =
  | "committed"
  | "invalid_input"
  | "conflict"
  | "replay"
  | "unavailable"
  | "uncertain";

export type FormationAssignmentLedgerResult = Readonly<{
  status: FormationAssignmentLedgerResultStatus;
  revision?: number;
  authorizationPermitted: false;
  retryPermitted: false;
}>;

export type ValidatedFormationAssignmentLedgerRequest = Readonly<{
  visitorId: string;
  operationId: string;
  expectedRevision: number;
  kind: FormationAssignmentLedgerOperationKind;
  assigneeId: string | null;
}>;

export function validateFormationAssignmentLedgerRequest(
  input: unknown
): ValidatedFormationAssignmentLedgerRequest | null {
  try {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      return null;
    }

    const value = input as Record<string, unknown>;

    function id(candidate: unknown): candidate is string {
      return typeof candidate === "string" &&
        candidate.length > 0 &&
        candidate.length <= 128 &&
        candidate.trim() === candidate &&
        /^[A-Za-z0-9_-]+$/.test(candidate);
    }

    if (!id(value.visitorId) || !id(value.operationId)) {
      return null;
    }

    if (!Number.isSafeInteger(value.expectedRevision) ||
        (value.expectedRevision as number) < 0 ||
        (value.expectedRevision as number) >= Number.MAX_SAFE_INTEGER) {
      return null;
    }

    if (value.kind !== "assigned" && value.kind !== "unassigned") {
      return null;
    }

    if (value.kind === "assigned") {
      if (!id(value.assigneeId)) {
        return null;
      }

      return {
        visitorId: value.visitorId,
        operationId: value.operationId,
        expectedRevision: value.expectedRevision as number,
        kind: "assigned",
        assigneeId: value.assigneeId
      };
    }

    if (value.assigneeId !== undefined &&
        value.assigneeId !== null) {
      return null;
    }

    return {
      visitorId: value.visitorId,
      operationId: value.operationId,
      expectedRevision: value.expectedRevision as number,
      kind: "unassigned",
      assigneeId: null
    };
  } catch {
    return null;
  }
}

export function nonAuthorizingAssignmentLedgerResult(
  status: FormationAssignmentLedgerResultStatus,
  revision?: number
): FormationAssignmentLedgerResult {
  return {
    status,
    ...(status === "committed" &&
        Number.isSafeInteger(revision) &&
        (revision as number) > 0
      ? { revision }
      : {}),
    authorizationPermitted: false,
    retryPermitted: false
  };
}