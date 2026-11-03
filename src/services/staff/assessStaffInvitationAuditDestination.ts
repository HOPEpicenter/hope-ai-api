import { types } from "node:util";

/**
 * Configuration comparison only. This does NOT verify Azure
 * resource identity, RBAC, authentication, network security,
 * existing tables, encryption, retention or storage durability.
 *
 * The expected destination must be pinned by trusted backend
 * composition, never derived from an incoming HTTP request.
 */

export type AuditDestinationDescription = Readonly<{
  schemaVersion: 1;
  environment: "staging";
  subscriptionId: string;
  resourceGroup: string;
  accountName: string;
  tableName: string;
  accountResourceId: string;
}>;

export type AuditDestinationAssessment = Readonly<{
  status:
    | "configuration_matches_unverified"
    | "configuration_mismatch"
    | "invalid_input";
  advisoryOnly: true;
  resourceIdentityVerified: false;
  leastPrivilegeVerified: false;
  auditDurabilityVerified: false;
  storageAccessPermitted: false;
  executionPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
}>;

const fields = [
  "schemaVersion",
  "environment",
  "subscriptionId",
  "resourceGroup",
  "accountName",
  "tableName",
  "accountResourceId"
] as const;

const denied = Object.freeze({
  advisoryOnly: true,
  resourceIdentityVerified: false,
  leastPrivilegeVerified: false,
  auditDurabilityVerified: false,
  storageAccessPermitted: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

function result(
  status: AuditDestinationAssessment["status"]
): AuditDestinationAssessment {
  return Object.freeze({ status, ...denied });
}

function readDescription(
  input: unknown
): AuditDestinationDescription | null {
  try {
    if (
      input === null ||
      typeof input !== "object" ||
      Array.isArray(input) ||
      types.isProxy(input)
    ) return null;

    const prototype = Object.getPrototypeOf(input);

    if (
      prototype !== Object.prototype &&
      prototype !== null
    ) return null;

    const keys = Reflect.ownKeys(input);

    if (
      keys.length !== fields.length ||
      keys.some(key =>
        typeof key !== "string" ||
        !fields.includes(key as typeof fields[number])
      )
    ) return null;

    const descriptors = Object.getOwnPropertyDescriptors(input);
    const values: Record<string, unknown> = Object.create(null);

    for (const field of fields) {
      const descriptor = descriptors[field];

      if (
        !descriptor ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) return null;

      values[field] = descriptor.value;
    }

    const subscriptionId = values.subscriptionId;
    const resourceGroup = values.resourceGroup;
    const accountName = values.accountName;
    const tableName = values.tableName;
    const accountResourceId = values.accountResourceId;

    if (
      values.schemaVersion !== 1 ||
      values.environment !== "staging" ||
      typeof subscriptionId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
        subscriptionId
      ) ||
      typeof resourceGroup !== "string" ||
      !/^[A-Za-z0-9._()-]{1,90}$/.test(resourceGroup) ||
      resourceGroup.endsWith(".") ||
      typeof accountName !== "string" ||
      !/^[a-z0-9]{3,24}$/.test(accountName) ||
      typeof tableName !== "string" ||
      !/^[A-Za-z][A-Za-z0-9]{2,62}$/.test(tableName) ||
      typeof accountResourceId !== "string"
    ) return null;

    const constructedResourceId =
      `/subscriptions/${subscriptionId}` +
      `/resourceGroups/${resourceGroup}` +
      `/providers/Microsoft.Storage/storageAccounts/${accountName}`;

    if (accountResourceId !== constructedResourceId) {
      return null;
    }

    return Object.freeze({
      schemaVersion: 1,
      environment: "staging",
      subscriptionId,
      resourceGroup,
      accountName,
      tableName,
      accountResourceId
    });
  } catch {
    return null;
  }
}

/**
 * Both inputs are untrusted until separately established by
 * real Azure control-plane evidence. Even a match is advisory.
 *
 * Do not use this assessment alone to create a TableClient,
 * authorize a query, configure credentials or enable writes.
 */
export function assessStaffInvitationAuditDestination(
  candidate: unknown,
  expected: unknown
): AuditDestinationAssessment {
  const actual = readDescription(candidate);
  const pinned = readDescription(expected);

  if (!actual || !pinned) return result("invalid_input");

  for (const field of fields) {
    if (actual[field] !== pinned[field]) {
      return result("configuration_mismatch");
    }
  }

  return result("configuration_matches_unverified");
}
