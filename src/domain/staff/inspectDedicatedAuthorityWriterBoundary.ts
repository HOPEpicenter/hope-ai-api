/**
 * E151: Dedicated Staff authority writer bootstrap boundary (inert).
 *
 * This module does not create Azure clients, load process.env, use
 * StaffEvents, obtain tokens, or grant authority. It only classifies
 * caller-supplied, synthetic endpoint/identity metadata. A passing
 * isolation check is NOT permission to connect to or write storage.
 *
 * No production caller is wired to this module. A future separate review
 * must prove effective RBAC, privileged credential isolation and a real
 * commit-time protocol before any operational implementation.
 */
export type DedicatedAuthorityWriterBoundary = Readonly<{
  classification: "candidate_isolated" | "blocked";
  reason:
    | "synthetic_metadata_separated_non_authorizing"
    | "missing_or_invalid_metadata"
    | "shared_application_storage_endpoint"
    | "shared_application_identity"
    | "unsupported_authentication_mode";
  storageConnectionPermitted: false;
  authorityWritePermitted: false;
  executionPermitted: false;
  migrationPermitted: false;
  retryPermitted: false;
  productionRolloutPermitted: false;
  effectivePermissionIsolationVerified: false;
}>;

function decision(
  classification: DedicatedAuthorityWriterBoundary["classification"],
  reason: DedicatedAuthorityWriterBoundary["reason"]
): DedicatedAuthorityWriterBoundary {
  return {
    classification,
    reason,
    storageConnectionPermitted: false,
    authorityWritePermitted: false,
    executionPermitted: false,
    migrationPermitted: false,
    retryPermitted: false,
    productionRolloutPermitted: false,
    effectivePermissionIsolationVerified: false
  };
}

function own(value: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}
function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function endpoint(value: unknown): string | null {
  if (typeof value !== "string" ||
      !/^https:\/\/[a-z0-9]{3,24}\.table\.core\.windows\.net\/?$/i.test(value)) {
    return null;
  }
  return value.toLowerCase().replace(/\/$/, "");
}
function clientId(value: unknown): string | null {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    return null;
  }
  return value.toLowerCase();
}

/**
 * Safe, non-executing review of candidate metadata only. No caller may
 * interpret "candidate_isolated" as a storage/authorization permit.
 */
export function inspectDedicatedAuthorityWriterBoundary(
  candidate: unknown
): DedicatedAuthorityWriterBoundary {
  try {
    if (!record(candidate)) {
      return decision("blocked", "missing_or_invalid_metadata");
    }
    const mode = own(candidate, "authenticationMode");
    if (mode !== "managed-identity") {
      return decision("blocked", "unsupported_authentication_mode");
    }
    const authorityEndpoint = endpoint(own(candidate, "authorityTableEndpoint"));
    const canonicalEndpoint = endpoint(own(candidate, "canonicalTableEndpoint"));
    const authorityIdentity = clientId(own(candidate, "authorityWriterClientId"));
    const canonicalIdentity = clientId(own(candidate, "canonicalWriterClientId"));
    if (!authorityEndpoint || !canonicalEndpoint ||
        !authorityIdentity || !canonicalIdentity) {
      return decision("blocked", "missing_or_invalid_metadata");
    }
    if (authorityEndpoint === canonicalEndpoint) {
      return decision("blocked", "shared_application_storage_endpoint");
    }
    if (authorityIdentity === canonicalIdentity) {
      return decision("blocked", "shared_application_identity");
    }
    return decision("candidate_isolated", "synthetic_metadata_separated_non_authorizing");
  } catch {
    return decision("blocked", "missing_or_invalid_metadata");
  }
}
