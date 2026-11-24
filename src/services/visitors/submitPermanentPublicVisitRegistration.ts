import {
  preparePermanentPublicVisitRegistration,
  type PublicVisitCommand
} from "./preparePermanentPublicVisitRegistration";

import {
  reservePermanentPublicVisitAdmission,
  type PermanentPublicAdmissionDependencies
} from "./reservePermanentVisitorQrAdmission";

import type {
  recordVisitorArrival
} from "./recordVisitorArrival";

import type {
  recordVisitorFamilyCheckIn
} from "./recordVisitorFamilyCheckIn";

type FamilyCommand = Extract<
  PublicVisitCommand,
  { family: unknown }
>;

type AdultCommand = Exclude<
  PublicVisitCommand,
  FamilyCommand
>;

export type PermanentPublicRegistrationDependencies =
  PermanentPublicAdmissionDependencies & {
    familyEnabled?: boolean;
    recordAdult?: (
      command: AdultCommand
    ) => ReturnType<typeof recordVisitorArrival>;
    recordFamily?: (
      command: FamilyCommand
    ) => ReturnType<typeof recordVisitorFamilyCheckIn>;
  };

export type PermanentPublicRegistrationResult =
  | Readonly<{
      accepted: true;
      status: "recorded";
    }>
  | Readonly<{
      accepted: false;
      status:
        | "unavailable"
        | "invalid"
        | "selection_required"
        | "admission_denied"
        | "submission_conflict"
        | "capacity_exhausted"
        | "requires_staff_review"
        | "try_later";
    }>;

function reject(
  status: Extract<
    PermanentPublicRegistrationResult,
    { accepted: false }
  >["status"]
): PermanentPublicRegistrationResult {
  return { accepted: false, status };
}

/**
 * Permanent, device-independent public registration.
 *
 * Trusted server dependencies only. Never construct
 * dependencies from browser JSON, cookies or headers.
 *
 * A session or reservation is not proof of attendance.
 * Confirm only after the canonical writer records
 * the complete requested registration.
 *
 * No Staff impersonation, follow-up plan creation,
 * visitor communication or device pairing occurs here.
 */
export async function submitPermanentPublicVisitRegistration(
  request: Readonly<{
    token: unknown;
    submissionId: unknown;
    body: unknown;
  }>,
  deps: PermanentPublicRegistrationDependencies = {}
): Promise<PermanentPublicRegistrationResult> {
  try {
    if (deps.enabled !== true ||
        !deps.context ||
        deps.context.enabled !== true) {
      return reject("unavailable");
    }

    const prepared =
      preparePermanentPublicVisitRegistration(
        {
          submissionId: request.submissionId,
          body: request.body
        },
        deps.context,
        deps.familyEnabled === true
      );

    if (prepared.status !== "ready") {
      return reject(prepared.status);
    }

    const command = prepared.command;

    // Verify writer availability before consuming
    // admission capacity.
    if ("family" in command) {
      if (typeof deps.recordFamily !== "function") {
        return reject("unavailable");
      }
    } else if (
      typeof deps.recordAdult !== "function"
    ) {
      return reject("unavailable");
    }

    const admission =
      await reservePermanentPublicVisitAdmission(
        {
          token: request.token,
          command
        },
        {
          ...deps,
          context: {
            ...deps.context,
            selectedEventId: command.serviceId
          }
        }
      );

    if (!admission.admitted) {
      switch (admission.status) {
        case "denied":
          return reject("admission_denied");
        case "conflict":
          return reject("submission_conflict");
        case "capacity_exhausted":
          return reject("capacity_exhausted");
        default:
          return reject("try_later");
      }
    }

    const result = "family" in command
      ? await deps.recordFamily!(command)
      : await deps.recordAdult!(command);

    switch (result.status) {
      case "recorded":
        return {
          accepted: true,
          status: "recorded"
        };

      case "invalid":
        return reject("invalid");

      case "requires_staff_review":
        return reject("requires_staff_review");

      case "submission_conflict":
        return reject("submission_conflict");

      case "family_incomplete":
        return reject(
          result.reason === "submission_conflict"
            ? "submission_conflict"
            : "try_later"
        );

      default:
        return reject("try_later");
    }
  } catch {
    // Unknown persistence outcomes must never
    // become registration confirmations.
    return reject("try_later");
  }
}
