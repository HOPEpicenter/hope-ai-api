import { createHopeTableClient } from "../shared/storage/createHopeTableClient";
import { matchesSyntheticIntakeRow } from "../services/visitors/syntheticIntakeInspectionValidation";

const ENDPOINT = "https://sthopekiad20261122.table.core.windows.net";
const TABLE = "KioskIntakeSubmissions";
const PARTITION = "friends-family-2026-11-22";
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type InspectionStatus =
  | "AUTHORIZATION_UNAVAILABLE"
  | "INVALID_TARGET"
  | "INVALID_CONFIGURATION"
  | "CLIENT_UNAVAILABLE"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "TIMEOUT"
  | "READ_FAILED"
  | "ROW_REJECTED"
  | "MATCHED";

type InspectionResult = Readonly<{ status: InspectionStatus }>;

function result(status: InspectionStatus): InspectionResult {
  return Object.freeze({ status });
}

function createIsolatedClient(config: unknown) {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }
  const value = config as Record<string, unknown>;
  if (
    Object.keys(value).length !== 3 ||
    !Object.prototype.hasOwnProperty.call(value, "mode") ||
    !Object.prototype.hasOwnProperty.call(value, "endpoint") ||
    !Object.prototype.hasOwnProperty.call(value, "managedIdentityClientId") ||
    value.mode !== "managed-identity" ||
    value.endpoint !== ENDPOINT ||
    typeof value.managedIdentityClientId !== "string" ||
    value.managedIdentityClientId.length !== 36 ||
    !GUID.test(value.managedIdentityClientId)
  ) {
    return null;
  }
  return createHopeTableClient(TABLE, {
    mode: "managed-identity",
    endpoint: ENDPOINT,
    managedIdentityClientId: value.managedIdentityClientId
  }, {
    retryOptions: { maxRetries: 0 },
    redirectOptions: { maxRetries: 0 }
  });
}

// This private adapter must not be connected until independent authorization
// and trusted UUID provenance have been implemented and reviewed.
async function inspectExactRecord(config: unknown, submissionId: unknown): Promise<InspectionResult> {
  if (
    typeof submissionId !== "string" ||
    submissionId.length !== 36 ||
    !UUID4.test(submissionId)
  ) {
    return result("INVALID_TARGET");
  }

  let client;
  try {
    client = createIsolatedClient(config);
  } catch {
    return result("CLIENT_UNAVAILABLE");
  }
  if (!client) return result("INVALID_CONFIGURATION");

  const signal = AbortSignal.timeout(10000);
  try {
    const row = await client.getEntity(PARTITION, submissionId, {
      abortSignal: signal
    });
    if (signal.aborted) return result("TIMEOUT");
    return result(matchesSyntheticIntakeRow(row, submissionId) ? "MATCHED" : "ROW_REJECTED");
  } catch (error) {
    const detail = error && typeof error === "object"
      ? error as { statusCode?: unknown; code?: unknown; name?: unknown }
      : {};
    if (signal.aborted || detail.name === "AbortError" ||
        detail.name === "TimeoutError" || detail.statusCode === 408 ||
        detail.statusCode === 504 ||
        detail.code === "ETIMEDOUT" || detail.code === "ESOCKETTIMEDOUT") {
      return result("TIMEOUT");
    }
    if (detail.statusCode === 404) return result("NOT_FOUND");
    if (detail.statusCode === 401 || detail.statusCode === 403) {
      return result("ACCESS_DENIED");
    }
    return result("READ_FAILED");
  }
}

// No flag, supplied verifier, fixture, or caller input can enable execution.
export async function inspectSyntheticKioskIntake(): Promise<InspectionResult> {
  return result("AUTHORIZATION_UNAVAILABLE");
}
