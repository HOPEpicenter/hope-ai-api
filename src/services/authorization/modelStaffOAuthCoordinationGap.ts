/**
 * Synthetic study of the gap between StaffEvents and
 * OAuth V2 receipt storage.
 *
 * These are independent persistence outcomes, not
 * authenticated evidence or an atomic transaction.
 *
 * No return value permits credential execution, replay,
 * retry, or mutation of production identity records.
 */

export type StaffOAuthWriteObservation =
  | "committed"
  | "not_committed"
  | "uncertain";

export interface StaffOAuthGapInput {
  readonly staffEvent: StaffOAuthWriteObservation;
  readonly oauthReceipt: StaffOAuthWriteObservation;
}

export type StaffOAuthGapClassification =
  | "both_observed_committed_not_atomic"
  | "partial_commit"
  | "uncertain_outcome"
  | "neither_observed_committed";

export interface StaffOAuthGapDecision {
  readonly classification: StaffOAuthGapClassification;
  readonly atomicCoordinationDemonstrated: false;
  readonly executionPermitted: false;
  readonly retryPermitted: false;
  readonly safeToTreatAsRevoked: false;
}

const OBSERVATIONS: readonly StaffOAuthWriteObservation[] = [
  "committed",
  "not_committed",
  "uncertain"
];

function validObservation(
  value: unknown
): value is StaffOAuthWriteObservation {
  return typeof value === "string" &&
    OBSERVATIONS.includes(value as StaffOAuthWriteObservation);
}

export function modelStaffOAuthCoordinationGap(
  input: unknown
): StaffOAuthGapDecision {

  let classification: StaffOAuthGapClassification =
    "uncertain_outcome";

  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input)
  ) {
    const value = input as Record<string, unknown>;

    if (
      Object.keys(value).length === 2 &&
      Object.prototype.hasOwnProperty.call(value, "staffEvent") &&
      Object.prototype.hasOwnProperty.call(value, "oauthReceipt") &&
      validObservation(value.staffEvent) &&
      validObservation(value.oauthReceipt)
    ) {
      if (
        value.staffEvent === "committed" &&
        value.oauthReceipt === "committed"
      ) {
        classification =
          "both_observed_committed_not_atomic";
      } else if (
        value.staffEvent === "uncertain" ||
        value.oauthReceipt === "uncertain"
      ) {
        classification = "uncertain_outcome";
      } else if (
        value.staffEvent === "not_committed" &&
        value.oauthReceipt === "not_committed"
      ) {
        classification = "neither_observed_committed";
      } else {
        classification = "partial_commit";
      }
    }
  }

  return Object.freeze({
    classification,
    atomicCoordinationDemonstrated: false as const,
    executionPermitted: false as const,
    retryPermitted: false as const,
    safeToTreatAsRevoked: false as const
  });
}
