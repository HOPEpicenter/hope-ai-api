const PRODUCTION_SITE = "hope-ai-api-prod";
const PRODUCTION_GROUP = "rg-hope-ai-api-prod";
const PRODUCTION_ACCOUNT = "hopeproddatafbafd6e4";

const PRODUCTION_TABLE_ENDPOINT =
  `https://${PRODUCTION_ACCOUNT}.table.core.windows.net`;

function disabled(value: string | undefined): boolean {
  return value === undefined ||
    value === "" ||
    value === "false";
}

function validCutover(value: string | undefined): boolean {
  return Boolean(value) &&
    Number.isFinite(Date.parse(value!)) &&
    new Date(value!).toISOString() === value;
}

/**
 * Validate the conventional Azure operational storage
 * connection-string contract without logging credentials
 * or accessing storage.
 *
 * Both existing canonical storage clients must resolve
 * to the same explicitly configured operational account.
 */
function productionStorageMatches(
  env: Readonly<NodeJS.ProcessEnv>
): boolean {
  if (env.HOPE_TABLE_AUTH_MODE !== "connection-string" ||
      env.HOPE_TABLE_ENDPOINT ||
      env.HOPE_TABLE_MANAGED_IDENTITY_CLIENT_ID) {
    return false;
  }

  const connection = env.STORAGE_CONNECTION_STRING;

  if (!connection ||
      connection !== connection.trim() ||
      /[\u0000-\u001f\u007f]/.test(connection)) {
    return false;
  }

  const parts = connection.split(";");

  if (parts[parts.length - 1] === "") {
    parts.pop();
  }

  const fields = new Map<string, string>();

  const allowed = new Set([
    "DefaultEndpointsProtocol",
    "AccountName",
    "AccountKey",
    "EndpointSuffix",
    "TableEndpoint"
  ]);

  for (const part of parts) {
    const separator = part.indexOf("=");

    if (separator <= 0) return false;

    const name = part.slice(0, separator);
    const value = part.slice(separator + 1);

    if (!allowed.has(name) ||
        fields.has(name) ||
        !value ||
        value !== value.trim()) {
      return false;
    }

    fields.set(name, value);
  }

  if (fields.get("DefaultEndpointsProtocol") !== "https" ||
      fields.get("AccountName") !== PRODUCTION_ACCOUNT ||
      fields.get("EndpointSuffix") !== "core.windows.net") {
    return false;
  }

  const tableEndpoint = fields.get("TableEndpoint");

  if (tableEndpoint !== undefined &&
      tableEndpoint !== PRODUCTION_TABLE_ENDPOINT &&
      tableEndpoint !== `${PRODUCTION_TABLE_ENDPOINT}/`) {
    return false;
  }

  const key = fields.get("AccountKey");

  if (!key ||
      !/^[A-Za-z0-9+/]{86}==$/.test(key)) {
    return false;
  }

  const decoded = Buffer.from(key, "base64");

  try {
    return decoded.length === 64 &&
      decoded.toString("base64") === key;
  } finally {
    decoded.fill(0);
  }
}

/**
 * Server configuration boundary for isolated and
 * production permanent visitor registration.
 *
 * This is not deployment approval, migration evidence,
 * a readiness certificate or a replacement for live
 * operational storage verification.
 */
export function permanentVisitorActivationPermitted(
  env: Readonly<NodeJS.ProcessEnv> = process.env
): boolean {
  const pilot =
    env.FEATURE_PERMANENT_VISITOR_ISOLATED_PILOT;

  const production =
    env.FEATURE_PERMANENT_VISITOR_PRODUCTION_ACTIVATION;

  const authority =
    env.FEATURE_PERMANENT_VISITOR_CONSENT_AUTHORITY === "true";

  if (!disabled(production) && production !== "true") {
    return false;
  }

  const productionIdentity =
    env.WEBSITE_SITE_NAME === PRODUCTION_SITE ||
    env.WEBSITE_RESOURCE_GROUP === PRODUCTION_GROUP;

  // Production never inherits legacy registration permission.
  // Isolated and production activation are mutually exclusive.
  if (productionIdentity || production === "true") {
    if (production !== "true" ||
        !authority ||
        !disabled(pilot) ||
        env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD !== "true" ||
        env.WEBSITE_SITE_NAME !== PRODUCTION_SITE ||
        env.WEBSITE_RESOURCE_GROUP !== PRODUCTION_GROUP ||
        (env.WEBSITE_SLOT_NAME &&
         env.WEBSITE_SLOT_NAME.toLowerCase() !== "production") ||
        !validCutover(
          env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER
        ) ||
        Date.parse(
          env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER!
        ) > Date.now()) {
      return false;
    }

    return productionStorageMatches(env);
  }

  // Preserve existing non-authority compatibility outside
  // the identified production deployment.
  if (!authority) {
    return disabled(pilot);
  }

  if (pilot !== "true") return false;

  // Existing isolated pilot boundary remains intact.
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

  return validCutover(
    env.HOPE_PERMANENT_VISITOR_CONSENT_CUTOVER
  );
}
