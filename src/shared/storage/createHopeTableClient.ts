import { TableClient, TableServiceClient } from "@azure/data-tables";
import { ManagedIdentityCredential } from "@azure/identity";

export type HopeTableClientConfig = {
  mode?: "connection-string" | "managed-identity";
  connectionString?: string;
  endpoint?: string;
  managedIdentityClientId?: string;
};

/**
 * Opt-in managed identity for isolated Flex application storage.
 * Existing connection-string behavior remains available.
 *
 * This function does not issue a storage request when constructing a client.
 */
export function createHopeTableClient(
  tableName: string,
  config: HopeTableClientConfig
): TableClient {
  if (!tableName || !tableName.trim()) {
    throw new Error("Table name is required.");
  }

  const mode = config.mode ?? "connection-string";

  if (mode === "connection-string") {
    const value = config.connectionString?.trim();

    if (!value) {
      throw new Error("Storage connection string is required.");
    }

    const isAzurite =
      /UseDevelopmentStorage=true/i.test(value) ||
      /devstoreaccount1/i.test(value) ||
      /127\.0\.0\.1/i.test(value) ||
      /localhost/i.test(value);

    return TableClient.fromConnectionString(
      value,
      tableName,
      isAzurite ? { allowInsecureConnection: true } : undefined
    );
  }

  if (mode !== "managed-identity") {
    throw new Error("Unsupported Table Storage authentication mode.");
  }

  if (config.connectionString?.trim()) {
    throw new Error(
      "Managed-identity mode must not receive a storage connection string."
    );
  }

  const endpoint = config.endpoint?.trim() ?? "";
  const clientId = config.managedIdentityClientId?.trim() ?? "";

  if (!/^https:\/\/[a-z0-9]{3,24}\.table\.core\.windows\.net\/?$/i.test(endpoint)) {
    throw new Error(
      "Managed-identity Table Storage requires an Azure HTTPS table endpoint."
    );
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    throw new Error("A valid user-assigned managed identity client ID is required.");
  }

  const credential = new ManagedIdentityCredential(clientId);

  return new TableClient(
    endpoint.replace(/\/$/, ""),
    tableName,
    credential
  );
}

/**
 * Service-level Table Storage operations, including createTable().
 * Managed identity is explicit and never falls back to a connection string.
 */
export function createHopeTableServiceClient(
  config: HopeTableClientConfig
): TableServiceClient {
  const mode = config.mode ?? "connection-string";

  if (mode === "connection-string") {
    const value = config.connectionString?.trim();

    if (!value) {
      throw new Error("Storage connection string is required.");
    }

    const isAzurite =
      /UseDevelopmentStorage=true/i.test(value) ||
      /devstoreaccount1/i.test(value) ||
      /127\.0\.0\.1/i.test(value) ||
      /localhost/i.test(value);

    return TableServiceClient.fromConnectionString(
      value,
      isAzurite ? { allowInsecureConnection: true } : undefined
    );
  }

  if (mode !== "managed-identity") {
    throw new Error("Unsupported Table Storage authentication mode.");
  }

  if (config.connectionString?.trim()) {
    throw new Error(
      "Managed-identity mode must not receive a storage connection string."
    );
  }

  const endpoint = config.endpoint?.trim() ?? "";
  const clientId = config.managedIdentityClientId?.trim() ?? "";

  if (!/^https:\/\/[a-z0-9]{3,24}\.table\.core\.windows\.net\/?$/i.test(endpoint)) {
    throw new Error(
      "Managed-identity Table Storage requires an Azure HTTPS table endpoint."
    );
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) {
    throw new Error(
      "A valid user-assigned managed identity client ID is required."
    );
  }

  return new TableServiceClient(
    endpoint.replace(/\/$/, ""),
    new ManagedIdentityCredential(clientId)
  );
}
