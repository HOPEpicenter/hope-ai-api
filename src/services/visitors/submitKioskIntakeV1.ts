import {
  assessKioskIntakeV1
} from "./assessKioskIntakeV1";
import {
  appendKioskIntakeSubmissionV1
} from "../../repositories/kioskIntakeSubmissionsRepositoryV1";

type Persist = typeof appendKioskIntakeSubmissionV1;

type Dependencies = {
  /**
   * Must be supplied only by a trusted server-side adapter.
   * This callback must independently verify admission.
   *
   * Never accept an authorization callback or its result
   * from a browser request body.
   */
  authorizeRequest?: () => Promise<boolean>;
  persist?: Persist;
};

export type SubmissionResult = Readonly<{
  accepted: boolean;
  status:
    | "disabled"
    | "not_authorized"
    | "invalid"
    | "recorded"
    | "already_recorded"
    | "idempotency_conflict";
}>;

/**
 * Internal service only.
 *
 * No HTTP route, public authentication, rate limiter,
 * or visitor reconciliation is implemented here.
 *
 * The feature flag is necessary but never sufficient.
 */
export async function submitKioskIntakeV1(
  input: unknown,
  submissionId: unknown,
  deps: Dependencies = {}
): Promise<SubmissionResult> {
  // Default deny, even when a trusted callback is provided.
  if (process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED !== "true") {
    return { accepted: false, status: "disabled" };
  }

  // No callback means no authenticated admission authority.
  if (!deps.authorizeRequest) {
    return { accepted: false, status: "not_authorized" };
  }

  let authorized = false;

  try {
    authorized = (await deps.authorizeRequest()) === true;
  } catch {
    // Unknown or failed authorization is a denial.
    return { accepted: false, status: "not_authorized" };
  }

  if (!authorized) {
    return { accepted: false, status: "not_authorized" };
  }

  const assessment = assessKioskIntakeV1(input);

  if (!assessment.valid) {
    return { accepted: false, status: "invalid" };
  }

  // The internal repository requires explicit trusted enablement.
  // Do not expose this options object to public callers.
  const persist = deps.persist ?? appendKioskIntakeSubmissionV1;

  const receipt = await persist(
    assessment.intake,
    submissionId,
    { enabled: true }
  );

  // The receipt contains no visitor details.
  return {
    accepted: receipt.accepted,
    status: receipt.status
  };
}