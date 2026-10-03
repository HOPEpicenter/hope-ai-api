import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";

export class MinistryEmailDeliveryClaimError extends Error {
  constructor(
    message: string,
    readonly code: "INVALID_CLAIM" | "ALREADY_CLAIMED" | "TRANSITION_CONFLICT"
  ) {
    super(message);
    this.name = "MinistryEmailDeliveryClaimError";
  }
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new MinistryEmailDeliveryClaimError(`${field} must be nonblank`, "INVALID_CLAIM");
  }
}

function requireIsoTimestamp(value: string): void {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== value) {
    throw new MinistryEmailDeliveryClaimError(
      "claimedAt must be an ISO timestamp",
      "INVALID_CLAIM"
    );
  }
}

export function claimMinistryEmailDeliveryForDispatch(
  record: MinistryEmailDeliveryRecord,
  dispatchAttemptId: string,
  claimedAt: string
): MinistryEmailDeliveryRecord {
  requireText(dispatchAttemptId, "dispatchAttemptId");
  requireText(claimedAt, "claimedAt");
  requireIsoTimestamp(claimedAt);

  if (record.state === "dispatching") {
    if (
      record.dispatchAttemptId === dispatchAttemptId &&
      record.dispatchClaimedAt === claimedAt &&
      record.provider === null &&
      record.providerMessageId === null &&
      record.providerAcceptedAt === null &&
      record.failedAt === null &&
      record.failureCode === null
    ) {
      return record;
    }
    throw new MinistryEmailDeliveryClaimError(
      "Delivery has already been claimed",
      "ALREADY_CLAIMED"
    );
  }

  if (record.state !== "requested") {
    throw new MinistryEmailDeliveryClaimError(
      `Cannot claim ministry email delivery from terminal state "${record.state}"`,
      "TRANSITION_CONFLICT"
    );
  }

  if (record.dispatchAttemptId !== null || record.dispatchClaimedAt !== null) {
    throw new MinistryEmailDeliveryClaimError(
      "Requested delivery must not have dispatch claim metadata",
      "TRANSITION_CONFLICT"
    );
  }

  if (
    record.provider !== null ||
    record.providerMessageId !== null ||
    record.providerAcceptedAt !== null ||
    record.failedAt !== null ||
    record.failureCode !== null
  ) {
    throw new MinistryEmailDeliveryClaimError(
      "Requested delivery must not have provider result metadata",
      "TRANSITION_CONFLICT"
    );
  }

  return {
    ...record,
    state: "dispatching",
    dispatchAttemptId,
    dispatchClaimedAt: claimedAt
  };
}
