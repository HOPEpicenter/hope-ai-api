import type { FormationEventEvidenceReadPort } from "./readFormationEventAcquisition";

export const FORMATION_EVENT_READ_ONLY_CREDENTIAL_BOUNDARY_READY = false;

export const FORMATION_EVENT_READ_ONLY_TABLE_NAME = "devFormationEvents";
const WEBSITE_SITE_NAME_SETTING = "WEBSITE_SITE_NAME";
const DEPLOYMENT_ENVIRONMENT_SETTING = "FORMATION_EVENT_DEPLOYMENT_ENVIRONMENT";
const ENDPOINT_SETTING = "FORMATION_EVENT_READ_ONLY_TABLE_ENDPOINT";
const MANAGED_IDENTITY_CLIENT_ID_SETTING =
  "FORMATION_EVENT_READ_ONLY_MANAGED_IDENTITY_CLIENT_ID";
const DEPLOYMENTS = Object.freeze({
  "hope-ai-api-staging": Object.freeze({
    environment: "staging",
    endpoint: "https://hopeaistagingstorage01.table.core.windows.net"
  }),
  "hope-ai-api-prod": Object.freeze({
    environment: "production",
    endpoint: "https://hopeproddatafbafd6e4.table.core.windows.net"
  })
});
const CLIENT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class FormationEventReadOnlyCredentialBoundaryUnavailableError extends Error {
  constructor() {
    super("Dedicated FormationEvent read-only storage is unavailable");
    this.name = "FormationEventReadOnlyCredentialBoundaryUnavailableError";
  }
}

function readTrustedConfiguration(): boolean {
  const siteName = process.env[WEBSITE_SITE_NAME_SETTING];
  if (siteName !== "hope-ai-api-staging" && siteName !== "hope-ai-api-prod") {
    return false;
  }

  const deployment = DEPLOYMENTS[siteName];
  const deploymentEnvironment = process.env[DEPLOYMENT_ENVIRONMENT_SETTING];
  const endpoint = process.env[ENDPOINT_SETTING];
  const managedIdentityClientId =
    process.env[MANAGED_IDENTITY_CLIENT_ID_SETTING];
  return deploymentEnvironment === deployment.environment
    && endpoint === deployment.endpoint
    && typeof managedIdentityClientId === "string"
    && CLIENT_ID_PATTERN.test(managedIdentityClientId);
}

/**
 * Validates explicit deployment configuration against the Azure Functions app
 * identity. This is configuration validation, not proof of Azure identity.
 */
export function hasValidFormationEventReadOnlyCredentialConfiguration(): boolean {
  return readTrustedConfiguration();
}

/**
 * Credential and reader construction remain intentionally unavailable until a
 * separately approved Azure identity and RBAC validation milestone.
 */
export function createFormationEventReadOnlyCredentialBoundary(): FormationEventEvidenceReadPort {
  throw new FormationEventReadOnlyCredentialBoundaryUnavailableError();
}
