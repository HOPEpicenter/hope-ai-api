import type {
  FormationEventEvidenceAcquisitionIdentityV1,
  FormationEventEvidenceAcquisitionInputV1,
  FormationEventEvidenceAcquisitionResultV1
} from "../../contracts/formationEventEvidenceAcquisition.v1";
import {
  getFormationEventInspectionAuthorizationConfiguration,
  type FormationEventInspectionAuthorizationConfiguration
} from "../../config/formationEventInspectionAuthorization";
import { assessFormationEventAcquisition } from "../../domain/formation/assessFormationEventAcquisition";
import { inspectFormationEventWithAuthenticatedAdmin } from "./inspectFormationEventWithAuthenticatedAdmin";
import type { FormationEventEvidenceReadPort } from "./readFormationEventAcquisition";

/**
 * SYNTHETIC COMPOSITION ONLY — NOT AN AUTHENTICATION OR PRODUCTION TRUST BOUNDARY.
 *
 * Composes the default-off server configuration gate with the existing
 * authenticated-administrator execution service. It does not prove that the
 * access token or the read port came from trusted infrastructure; a plain,
 * frozen, or type-asserted object is not proof of provenance. That remains a
 * separate, independently reviewed integration milestone. It exposes no route,
 * storage client, or scheduler and never contacts visitors.
 */
export type TrustedInvocationConfigurationReader = () => FormationEventInspectionAuthorizationConfiguration;
export type TrustedInvocationAuthenticatedExecution = typeof inspectFormationEventWithAuthenticatedAdmin;

export type TrustedInvocationFunction = (
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string,
  readPort: FormationEventEvidenceReadPort
) => Promise<FormationEventEvidenceAcquisitionResultV1>;

function assessUnavailable(
  identity: FormationEventEvidenceAcquisitionIdentityV1
): FormationEventEvidenceAcquisitionResultV1 {
  return assessFormationEventAcquisition({
    identity,
    observation: { availability: "unavailable" }
  } as FormationEventEvidenceAcquisitionInputV1);
}

function isEnabled(
  configuration: unknown
): configuration is Extract<FormationEventInspectionAuthorizationConfiguration, { evidenceInspectionEnabled: true }> {
  if (typeof configuration !== "object" || configuration === null) return false;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(configuration, "evidenceInspectionEnabled");
    const authorization = Object.getOwnPropertyDescriptor(configuration, "authorizationConfiguration");
    return descriptor !== undefined
      && "value" in descriptor
      && descriptor.value === true
      && authorization !== undefined
      && "value" in authorization
      && typeof authorization.value === "object"
      && authorization.value !== null;
  } catch {
    // Hostile or revoked proxies fail closed; only shape inspection is guarded.
    return false;
  }
}

/**
 * SYNTHETIC-ONLY factory for deterministic tests. The injected functions live
 * in a closure created by trusted code; they are a testing seam, not a
 * security guarantee, and the returned function accepts no overrides.
 */
export function createSyntheticTrustedFormationEventInspectionInvocation(
  readConfiguration: TrustedInvocationConfigurationReader,
  executeAuthenticatedInspection: TrustedInvocationAuthenticatedExecution
): TrustedInvocationFunction {
  return async (identity, accessToken, readPort) => {
    let configuration: unknown;
    try {
      configuration = readConfiguration();
    } catch {
      return assessUnavailable(identity);
    }

    const identityAssessment = assessUnavailable(identity);
    if (
      !isEnabled(configuration)
      || identityAssessment.status !== "unavailable"
      || identityAssessment.reasonCode !== "observation_unavailable"
      || identityAssessment.candidateRowKey === null
    ) {
      return identityAssessment;
    }

    return executeAuthenticatedInspection(
      identity,
      accessToken,
      configuration.authorizationConfiguration,
      true,
      readPort
    );
  };
}

const productionShapedInvocation = createSyntheticTrustedFormationEventInspectionInvocation(
  () => getFormationEventInspectionAuthorizationConfiguration(),
  inspectFormationEventWithAuthenticatedAdmin
);

/**
 * Production-shaped interface: identity, token, and read port only. Gate and
 * authorization configuration come from the server environment; no decision,
 * administrator IDs, enablement flag, or dependency override is accepted.
 */
export function inspectFormationEventWithTrustedInvocation(
  identity: FormationEventEvidenceAcquisitionIdentityV1,
  accessToken: string,
  readPort: FormationEventEvidenceReadPort
): Promise<FormationEventEvidenceAcquisitionResultV1> {
  return productionShapedInvocation(identity, accessToken, readPort);
}
