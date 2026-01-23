const DEVSTORE_KEY =
  "Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==";

function canonicalAzuriteTablesCs(): string {
  return (
    "DefaultEndpointsProtocol=http;" +
    "AccountName=devstoreaccount1;" +
    `AccountKey=${DEVSTORE_KEY};` +
    "TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
  );
}

function normalizeAzuriteTables(val: string): string {
  // Common shorthand variant
  if (/UseDevelopmentStorage=true/i.test(val)) return canonicalAzuriteTablesCs();

  // Fix missing /devstoreaccount1 if TableEndpoint points to 10002
  if (/TableEndpoint=http:\/\/(localhost|127\.0\.0\.1):10002;?/i.test(val) &&
      !/TableEndpoint=http:\/\/(localhost|127\.0\.0\.1):10002\/devstoreaccount1;?/i.test(val)) {
    return val.replace(
      /TableEndpoint=http:\/\/(localhost|127\.0\.0\.1):10002;?/i,
      "TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;"
    );
  }

  return val;
}

function isAzuriteTables(val: string): boolean {
  return (
    /UseDevelopmentStorage=true/i.test(val) ||
    /TableEndpoint=http:\/\/(localhost|127\.0\.0\.1):10002\/devstoreaccount1;?/i.test(val)
  );
}

/**
 * Resolve + normalize storage connection string with safety rails.
 *
 * - Normalizes common Azurite variants to canonical Tables endpoint.
 * - If CI=true OR HOPE_FORCE_AZURITE=1, refuses non-Azurite endpoints.
 */
export function resolveStorageConnectionString(raw: string | undefined): string {
  const v = (raw ?? "").trim();
  if (!v) throw new Error("STORAGE_CONNECTION_STRING (or AzureWebJobsStorage) is required.");

  const normalized = normalizeAzuriteTables(v);

  const ci = (process.env.CI ?? "").toLowerCase() === "true";
  const forceAzurite = (process.env.HOPE_FORCE_AZURITE ?? "") === "1";

  if ((ci || forceAzurite) && !isAzuriteTables(normalized)) {
    throw new Error(
      "Refusing to use non-Azurite Table Storage in CI/forced-local mode. " +
      "Set STORAGE_CONNECTION_STRING to Azurite Tables (TableEndpoint http://127.0.0.1:10002/devstoreaccount1)."
    );
  }

  return normalized;
}
