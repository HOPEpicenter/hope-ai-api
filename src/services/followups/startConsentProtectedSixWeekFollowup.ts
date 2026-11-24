

import {
  readLatestRegistrationConsent,
  type RegistrationConsent
} from "./readLatestRegistrationConsent";

export {
  readLatestRegistrationConsent,
  type RegistrationConsent
} from "./readLatestRegistrationConsent";

const VISITOR_ID =
  /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

import {
  startSixWeekVisitorFollowup,
  type StartSixWeekFollowupInput,
  type SixWeekFollowupCommandResult
} from "./sixWeekVisitorFollowupCommands";

type Dependencies = {
  readConsent?: (
    visitorId: string
  ) => Promise<RegistrationConsent>;

  start?: typeof startSixWeekVisitorFollowup;
};

/**
 * Add durable registration consent enforcement without
 * replacing the existing active-Staff authorization.
 *
 * Intended for the already authenticated Staff endpoint.
 * Never invoke from public registration as a Staff actor.
 */
export async function startConsentProtectedSixWeekFollowup(
  input: StartSixWeekFollowupInput,
  deps: Dependencies = {}
): Promise<SixWeekFollowupCommandResult> {
  if (typeof input.visitorId !== "string" ||
      !VISITOR_ID.test(input.visitorId.trim())) {
    return {
      accepted: false,
      status: 400,
      error: "visitorId is required"
    };
  }

  if (input.contactConsent !== true) {
    return {
      accepted: false,
      status: 400,
      error: "Explicit follow-up consent is required"
    };
  }

  try {
    const visitorId = input.visitorId.trim();

    const consent = await (
      deps.readConsent ?? readLatestRegistrationConsent
    )(visitorId);

    if (consent === "declined") {
      return {
        accepted: false,
        status: 409,
        error: "Visitor declined follow-up permission"
      };
    }

    if (consent !== "granted" &&
        consent !== "legacy_no_evidence") {
      return {
        accepted: false,
        status: 503,
        error: "Follow-up consent could not be verified"
      };
    }

    // Legacy records retain their existing authorized
    // Staff consent workflow. Missing public evidence
    // does not itself constitute permission.
    //
    // The canonical command still checks visitor existence,
    // active Staff actor, owner and all other requirements.
    return await (
      deps.start ?? startSixWeekVisitorFollowup
    )({
      ...input,
      visitorId
    });
  } catch {
    return {
      accepted: false,
      status: 503,
      error: "Unable to verify follow-up readiness"
    };
  }
}
