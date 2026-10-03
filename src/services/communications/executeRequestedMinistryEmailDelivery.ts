import type { MinistryEmailDeliveryRecord } from "../../domain/communications/ministryEmailDeliveryContracts";
import type { MinistryEmailDeliveryProviderAdapter } from "./ministryEmailDeliveryProvider";
import { transitionMinistryEmailDeliveryProviderResult } from "./transitionMinistryEmailDeliveryProviderResult";

/**
 * Executes against an explicitly injected adapter and returns a deterministic
 * transition. It neither loads secrets nor persists delivery state.
 */
export async function executeRequestedMinistryEmailDelivery(
  record: MinistryEmailDeliveryRecord,
  provider: MinistryEmailDeliveryProviderAdapter,
  occurredAt: string
): Promise<MinistryEmailDeliveryRecord> {
  if (record.state !== "requested") {
    throw new Error("Ministry email delivery must be in requested state");
  }

  const result = await provider.send({
    deliveryId: record.deliveryId,
    recipientEmail: record.recipientEmail,
    subject: record.subject,
    body: record.body
  });

  return transitionMinistryEmailDeliveryProviderResult(record, result, occurredAt);
}
