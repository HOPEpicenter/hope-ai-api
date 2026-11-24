import {
  readLatestRegistrationConsent,
  registrationConsentAuthorityEnabled,
  registrationConsentGuardEnabled,
  type RegistrationConsent
} from "./readLatestRegistrationConsent";

export type RegistrationConsentReader =
  (visitorId: string) => Promise<RegistrationConsent>;

export type RegistrationContactFailure = {
  accepted: false;
  status: 409 | 503;
  error: string;
};

/** Additional guard only; existing staff and channel checks still apply.
 * Keep enabled independently of public intake after launch.
 */
export async function requireCurrentRegistrationContactPermission(
  visitorId: string,
  readConsent: RegistrationConsentReader = readLatestRegistrationConsent
): Promise<RegistrationContactFailure | null> {
  if (!registrationConsentGuardEnabled()) {
    return null;
  }
  try {
    const consent = await readConsent(visitorId);
    if (consent === "pending_verification") {
      return { accepted: false, status: 409, error: "Visitor consent verification pending" };
    }
    if (consent === "declined") {
      return { accepted: false, status: 409, error: "Visitor declined follow-up permission" };
    }
    if (consent === "granted" ||
        (consent === "legacy_no_evidence" && !registrationConsentAuthorityEnabled())) {
      return null;
    }
  } catch {
    // A failed read cannot authorize new contact work.
  }
  return { accepted: false, status: 503, error: "Follow-up consent could not be verified" };
}
