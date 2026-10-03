import type { MinistryEmailDeliveryProvider } from "../../domain/communications/ministryEmailDeliveryContracts";

export type MinistryEmailProviderRequest = {
  deliveryId: string;
  recipientEmail: string;
  subject: string;
  body: string;
};

export type MinistryEmailProviderResult =
  | {
    accepted: true;
    provider: MinistryEmailDeliveryProvider;
    providerMessageId: string;
  }
  | {
    accepted: false;
    provider: MinistryEmailDeliveryProvider;
    failureCode: string;
  };

/** Abstraction only; this PR intentionally provides no concrete adapter. */
export interface MinistryEmailDeliveryProviderAdapter {
  send(request: MinistryEmailProviderRequest): Promise<MinistryEmailProviderResult>;
}
