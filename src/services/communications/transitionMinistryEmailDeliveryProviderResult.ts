import type {
  MinistryEmailDeliveryRecord,
  MinistryEmailDeliveryState
} from "../../domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailProviderResult } from "./ministryEmailDeliveryProvider";

export class MinistryEmailDeliveryTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MinistryEmailDeliveryTransitionError";
  }
}

function requireText(value: string, field: string): void {
  if (!value.trim()) {
    throw new MinistryEmailDeliveryTransitionError(`${field} must be nonblank`);
  }
}

function replayMatches(
  record: MinistryEmailDeliveryRecord,
  result: MinistryEmailProviderResult
): boolean {
  if (result.accepted) {
    return record.state === "provider_accepted" &&
      record.provider === result.provider &&
      record.providerMessageId === result.providerMessageId &&
      Boolean(record.dispatchAttemptId) &&
      Boolean(record.dispatchClaimedAt) &&
      record.providerAcceptedAt !== null &&
      record.failedAt === null &&
      record.failureCode === null;
  }

  return record.state === "failed" &&
    record.provider === result.provider &&
    Boolean(record.dispatchAttemptId) &&
    Boolean(record.dispatchClaimedAt) &&
    record.providerMessageId === null &&
    record.providerAcceptedAt === null &&
    record.failedAt !== null &&
    record.failureCode === result.failureCode;
}

export function transitionMinistryEmailDeliveryProviderResult(
  record: MinistryEmailDeliveryRecord,
  result: MinistryEmailProviderResult,
  occurredAt: string
): MinistryEmailDeliveryRecord {
  requireText(occurredAt, "occurredAt");
  if (result.accepted) {
    requireText(result.providerMessageId, "providerMessageId");
  } else {
    requireText(result.failureCode, "failureCode");
  }
  if (record.state === "dispatching") {
    requireText(record.dispatchAttemptId ?? "", "dispatchAttemptId");
    requireText(record.dispatchClaimedAt ?? "", "dispatchClaimedAt");
  }

  if (record.state !== "dispatching") {
    if (replayMatches(record, result)) return record;
    throw new MinistryEmailDeliveryTransitionError(
      `Cannot transition ministry email delivery from state "${record.state}"`
    );
  }

  const nextState: MinistryEmailDeliveryState = result.accepted
    ? "provider_accepted"
    : "failed";

  if (result.accepted) {
    return {
      ...record,
      state: nextState,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      providerAcceptedAt: occurredAt,
      failedAt: null,
      failureCode: null
    };
  }

  return {
    ...record,
    state: nextState,
    provider: result.provider,
    providerMessageId: null,
    providerAcceptedAt: null,
    failedAt: occurredAt,
    failureCode: result.failureCode
  };
}
