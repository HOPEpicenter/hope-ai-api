import { types } from "node:util";

import {
  verifyEntraStaffAccessToken,
  type EntraStaffTokenVerificationConfiguration
} from "../authorization/verifyEntraStaffAccessToken";
type CanonicalDirectoryReader =
  typeof import("./readCanonicalStaffDirectory").readCanonicalStaffDirectory;

/**
 * Non-authorizing C6 staff attribution.
 *
 * Production defaults use the existing Entra verifier and canonical
 * event-backed directory. Dependency injection exists for synthetic
 * tests; injected functions are not automatically trusted.
 *
 * This resolver never grants write, invitation, retry or rollout
 * permission. No caller-supplied staff ID is accepted.
 */

export type VerifiedStaffAuditActorResult =
  | Readonly<{
      status: "verified_active_staff";
      actor: Readonly<{
        staffId: string;
        entraTenantId: string;
        entraObjectId: string;
      }>;
      authoritative: false;
      executionPermitted: false;
      retryPermitted: false;
      productionRolloutPermitted: false;
    }>
  | Readonly<{
      status: "rejected" | "unavailable";
      actor: null;
      authoritative: false;
      executionPermitted: false;
      retryPermitted: false;
      productionRolloutPermitted: false;
    }>;

export type StaffAuditActorDependencies = Readonly<{
  verifyToken?: typeof verifyEntraStaffAccessToken;
  readDirectory?: CanonicalDirectoryReader;
}>;

const guidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const denied = Object.freeze({
  authoritative: false,
  executionPermitted: false,
  retryPermitted: false,
  productionRolloutPermitted: false
} as const);

function fail(
  status: "rejected" | "unavailable"
): VerifiedStaffAuditActorResult {
  return Object.freeze({
    status,
    actor: null,
    ...denied
  });
}

/**
 * Reads only own data properties from non-proxy objects.
 * Accessors and proxies cannot supply trusted identity evidence.
 */
function ownValue(input: unknown, key: string): unknown {
  if (
    input === null ||
    typeof input !== "object" ||
    types.isProxy(input)
  ) {
    throw new Error("Identity evidence invalid");
  }

  const descriptor = Object.getOwnPropertyDescriptor(input, key);

  if (!descriptor || !("value" in descriptor)) {
    throw new Error("Identity evidence invalid");
  }

  return descriptor.value;
}

/**
 * Determines which active canonical staff member corresponds to
 * an independently verified Entra access token.
 *
 * This is identity evidence only, not an authorization decision.
 * The consuming operation must independently enforce permissions.
 */
export async function resolveVerifiedStaffAuditActor(
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  dependencies: StaffAuditActorDependencies = {}
): Promise<VerifiedStaffAuditActorResult> {
  if (
    typeof accessToken !== "string" ||
    !accessToken ||
    accessToken.trim() !== accessToken
  ) {
    return fail("rejected");
  }

  const verify =
    dependencies.verifyToken ?? verifyEntraStaffAccessToken;

  let tenantId: string;
  let objectId: string;

  try {
    const verified = await verify(accessToken, configuration);

    const claimedTenantId = ownValue(verified, "tenantId");
    const claimedObjectId = ownValue(verified, "objectId");

    if (
      typeof claimedTenantId !== "string" ||
      typeof claimedObjectId !== "string" ||
      !guidPattern.test(claimedTenantId) ||
      !guidPattern.test(claimedObjectId)
    ) {
      return fail("rejected");
    }

    tenantId = claimedTenantId.toLowerCase();
    objectId = claimedObjectId.toLowerCase();
  } catch {
    return fail("rejected");
  }

  try {
    // Load the production storage-backed reader only when needed.
    // Synthetic injected readers require no Azure configuration.
    const readDirectory = dependencies.readDirectory ??
      (await import("./readCanonicalStaffDirectory"))
        .readCanonicalStaffDirectory;

    const directory = await readDirectory();

    if (!Array.isArray(directory) || types.isProxy(directory)) {
      return fail("unavailable");
    }

    const matches: Array<{
      staffId: string;
      status: unknown;
    }> = [];

    for (const identity of directory) {
      const boundTenant = ownValue(identity, "entraTenantId");
      const boundObject = ownValue(identity, "entraObjectId");
      const staffId = ownValue(identity, "staffId");
      const status = ownValue(identity, "status");

      if (
        boundTenant !== null &&
        (typeof boundTenant !== "string" ||
          !guidPattern.test(boundTenant))
      ) return fail("unavailable");

      if (
        boundObject !== null &&
        (typeof boundObject !== "string" ||
          !guidPattern.test(boundObject))
      ) return fail("unavailable");

      if (
        (boundTenant === null) !== (boundObject === null) ||
        typeof staffId !== "string" ||
        !staffId ||
        staffId.trim() !== staffId ||
        staffId.length > 256 ||
        !["active", "pending", "inactive"].includes(
          String(status)
        )
      ) {
        return fail("unavailable");
      }

      if (
        boundTenant !== null &&
        boundObject !== null &&
        boundTenant.toLowerCase() === tenantId &&
        boundObject.toLowerCase() === objectId
      ) {
        matches.push({ staffId, status });
      }
    }

    // Duplicate claims, even for the same staffId, are rejected.
    if (matches.length !== 1) {
      return fail("rejected");
    }

    const identity = matches[0];

    if (identity.status !== "active") {
      return fail("rejected");
    }

    return Object.freeze({
      status: "verified_active_staff",
      actor: Object.freeze({
        staffId: identity.staffId,
        entraTenantId: tenantId,
        entraObjectId: objectId
      }),
      ...denied
    });
  } catch {
    // Cannot determine the active canonical identity safely.
    return fail("unavailable");
  }
}
