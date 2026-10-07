import type {
  MinistryEmailDeliveryProvider,
  MinistryEmailDeliveryState
} from "../domain/communications/ministryEmailDeliveryContracts";

/** Internal inspection contract; no HTTP route or recovery authority. */
export type MinistryEmailDispatchInspectionV1 = {
  deliveryId: string;
  state: MinistryEmailDeliveryState;
  inspectedAt: string;
  requestedAt: string;
  dispatchAttemptId: string | null;
  dispatchClaimedAt: string | null;
  /** Informational only. Age never grants retry or reclaim authority. */
  claimAgeSeconds: number | null;
  provider: MinistryEmailDeliveryProvider | null;
  providerMessageId: string | null;
  providerAcceptedAt: string | null;
  failedAt: string | null;
  /** Only the void time is exposed; actor and reason remain private. */
  voidedAt?: string | null;
  assessment: "not_claimed" | "execution_unresolved" | "terminal_recorded";
  reconciliationRequired: boolean;
  /** Inspection never authorizes a send, including for requested records. */
  resendAuthorized: false;
};

export type ReadMinistryEmailDispatchInspectionResultV1 =
  | { ok: true; inspection: MinistryEmailDispatchInspectionV1 }
  | {
      ok: false;
      code:
        | "INVALID_INSPECTION_INPUT"
        | "DELIVERY_NOT_FOUND"
        | "INVALID_DELIVERY_RECORD"
        | "DELIVERY_INSPECTION_UNAVAILABLE";
    };
