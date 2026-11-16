import {
  createTrustedBootstrapGate
} from "./trusted-bootstrap-gate.mjs";

/**
 * Connects the configured owner-token assessor to the isolated
 * signed-approval assessment. This remains assessment-only.
 */
export function createOwnerTokenSignedApprovalGate(
  ownerAuthorization,
  keyId,
  dependencies
) {
  const configuration =
    ownerAuthorization?.verificationConfiguration;

  if (
    ownerAuthorization?.verificationConfigured !== true ||
    ownerAuthorization.executionPermitted !== false ||
    ownerAuthorization.staffCreationPermitted !== false ||
    ownerAuthorization.approvalConsumptionPermitted !== false ||
    !configuration ||
    !dependencies ||
    typeof dependencies.assessOwnerToken !== "function" ||
    typeof dependencies.resolveOwnerTokenSigningKey !== "function" ||
    typeof dependencies.resolvePublicKey !== "function"
  ) {
    throw new TypeError(
      "TRUSTED_OWNER_AUTHORIZATION_CONFIGURATION_REQUIRED"
    );
  }

  return createTrustedBootstrapGate(
    {
      ownerTenantId: configuration.tenantId,
      ownerObjectId: configuration.ownerObjectId,
      keyId
    },
    {
      async authenticateOwner(accessToken) {
        const assessment = await dependencies.assessOwnerToken(
          accessToken,
          configuration,
          dependencies.resolveOwnerTokenSigningKey
        );

        if (
          assessment?.status !==
            "VERIFIED_OWNER_TOKEN_EXECUTION_DISABLED" ||
          assessment.identityMatched !== true ||
          assessment.tokenPermissionVerified !== true ||
          assessment.executionPermitted !== false ||
          assessment.staffCreationPermitted !== false ||
          assessment.approvalConsumptionPermitted !== false ||
          assessment.authorizationGranted !== false
        ) {
          return { authenticated: false };
        }

        return {
          authenticated: true,
          tenantId: configuration.tenantId,
          objectId: configuration.ownerObjectId
        };
      },
      resolvePublicKey: dependencies.resolvePublicKey
    }
  );
}
