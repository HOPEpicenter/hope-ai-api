/**
 * Temporary release boundary for the explicitly approved,
 * isolated permanent visitor pilot.
 *
 * These values are server configuration, never browser input.
 * They do not replace deployment-time isolation verification.
 *
 * Production consent-authority activation remains blocked.
 */
export function permanentVisitorActivationPermitted(
  env: Readonly<NodeJS.ProcessEnv> = process.env
): boolean {
  const pilot =
    env.FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT;

  const authority =
    env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY === "true";

  // Preserve existing non-authority compatibility only when
  // the isolated pilot has not been requested.
  if (!authority) {
    return pilot === undefined ||
      pilot === "" ||
      pilot === "false";
  }

  if (pilot !== "true") return false;

  if (
    env.WEBSITE_SITE_NAME !== "hope-kiosk-acceptance-api" ||
    env.WEBSITE_RESOURCE_GROUP !== "rg-hope-kiosk-acceptance-20261122" ||
    env.HOPE_TABLE_AUTH_MODE !== "managed-identity"
  ) {
    return false;
  }

  const endpoint = env.HOPE_TABLE_ENDPOINT;

  if (
    endpoint !== "https://sthopekiad20261122.table.core.windows.net" &&
    endpoint !== "https://sthopekiad20261122.table.core.windows.net/"
  ) {
    return false;
  }

  if (
    env.STORAGE_CONNECTION_STRING ||
    env.AzureWebJobsStorage
  ) {
    return false;
  }

  const cutover = env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER;

  if (
    !cutover ||
    !Number.isFinite(Date.parse(cutover)) ||
    new Date(cutover).toISOString() !== cutover
  ) {
    return false;
  }

  return true;
}
