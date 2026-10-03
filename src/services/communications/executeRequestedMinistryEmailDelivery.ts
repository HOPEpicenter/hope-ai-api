import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailDeliveryProviderAdapter } from "./ministryEmailDeliveryProvider";
import { transitionMinistryEmailDeliveryProviderResult } from "./transitionMinistryEmailDeliveryProviderResult";

/**
 * Executes against an explicitly injected adapter and returns a deterministic
 * transition. It neither loads secrets nor persists delivery state.
 */
export async function executeClaimedMinistryEmailDelivery(
  record: MinistryEmailDeliveryRecord,
  provider: MinistryEmailDeliveryProviderAdapter,
  occurredAt: string
): Promise<MinistryEmailDeliveryRecord> {
  if (record.state !== "dispatching") {
    throw new Error("Ministry email delivery must be in dispatching state");
  }
  if (!record.dispatchAttemptId?.trim() || !record.dispatchClaimedAt?.trim()) {
    throw new Error("Ministry email delivery must have a durable dispatch claim");
  }
  const timestamp = new Date(occurredAt);
  if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== occurredAt) {
    throw new Error("Provider result timestamp must be an ISO timestamp");
  }

  const result = await provider.send({
    deliveryId: record.deliveryId,
    recipientEmail: record.recipientEmail,
    subject: record.subject,
    body: record.body
  });

  return transitionMinistryEmailDeliveryProviderResult(record, result, occurredAt);
}
