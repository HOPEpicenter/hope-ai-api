import type { CanonicalStaffIdentity } from "../../domain/staff/projectStaffDirectory";
import type { RequiredAdminStaffActor } from "./adminStaffActor";
import {
  requireAdminApiKeyForFunction
} from "./adminApiKey";
import {
  requireAdminStaffActorForFunction
} from "./adminStaffActor";
import {
  authorizeAuthenticatedStaffAction,
  type AuthenticatedStaffAuthorizationConfiguration,
  type AuthorizeAuthenticatedStaffActionDependencies
} from "../../services/authorization/authorizeAuthenticatedStaffAction";
import type { EntraStaffTokenVerificationConfiguration } from "../../services/authorization/verifyEntraStaffAccessToken";

export type AuthenticatedAdminStaffActorConfiguration = {
  enforcementEnabled?: boolean;
  verificationConfiguration?: EntraStaffTokenVerificationConfiguration;
  administratorStaffIds?: readonly string[];
};

export type AuthenticatedAdminStaffActorDependencies = Pick<
  AuthorizeAuthenticatedStaffActionDependencies,
  "readStaffDirectory" | "readCanonicalStaffIdentity" | "resolveSigningKey"
> & {
  readLegacyStaffIdentity?: (
    staffId: string
  ) => Promise<CanonicalStaffIdentity | null>;
};

type ReadHeaderResult =
  | { present: false }
  | { present: true; valid: true; value: string }
  | { present: true; valid: false };

function readHeaderValue(value: unknown): ReadHeaderResult {
  if (value === undefined || value === null) {
    return { present: false };
  }

  if (typeof value !== "string" || value.includes(",")) {
    return { present: true, valid: false };
  }

  return { present: true, valid: true, value: value.trim() };
}

function readUnambiguousHeader(
  request: any,
  headerName: string
): ReadHeaderResult {
  const normalizedName = headerName.toLowerCase();
  const rawHeaders = request?.rawHeaders;
  const representations: ReadHeaderResult[] = [];

  if (rawHeaders !== undefined && rawHeaders !== null) {
    if (!Array.isArray(rawHeaders) || rawHeaders.length % 2 !== 0) {
      return { present: true, valid: false };
    }

    const values: unknown[] = [];
    for (let index = 0; index + 1 < rawHeaders.length; index += 2) {
      if (
        typeof rawHeaders[index] !== "string" ||
        typeof rawHeaders[index + 1] !== "string"
      ) {
        return { present: true, valid: false };
      }

      if (
        rawHeaders[index].toLowerCase() === normalizedName
      ) {
        values.push(rawHeaders[index + 1]);
      }
    }

    if (values.length > 1) {
      return { present: true, valid: false };
    }

    if (values.length === 1) {
      representations.push(readHeaderValue(values[0]));
    }
  }

  const headers = request?.headers;
  if (typeof headers?.get === "function") {
    representations.push(readHeaderValue(headers.get(normalizedName)));
  }

  if (headers && typeof headers === "object") {
    const matchingKeys = Object.keys(headers).filter(
      key => key.toLowerCase() === normalizedName
    );

    if (matchingKeys.length > 1) {
      return { present: true, valid: false };
    }

    if (matchingKeys.length === 1) {
      representations.push(
        readHeaderValue(headers[matchingKeys[0]])
      );
    }
  }

  if (typeof request?.get === "function") {
    representations.push(readHeaderValue(request.get(normalizedName)));
  }

  if (
    representations.some(
      representation =>
        representation.present && !representation.valid
    )
  ) {
    return { present: true, valid: false };
  }

  const values = representations.flatMap(representation =>
    representation.present && representation.valid
      ? [representation.value]
      : []
  );
  if (values.some(value => value !== values[0])) {
    return { present: true, valid: false };
  }

  return values.length === 0
    ? { present: false }
    : { present: true, valid: true, value: values[0] };
}

function denied(status: number): RequiredAdminStaffActor {
  return {
    ok: false,
    status,
    body: {
      ok: false,
      error: "Unauthorized"
    }
  };
}

function parseBearerToken(request: any): string | null {
  const header = readUnambiguousHeader(request, "authorization");

  if (!header.present || !header.valid) {
    return null;
  }

  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
    header.value.trim()
  );

  return match?.[1] ?? null;
}

/**
 * HTTP adapter for the initial Entra-backed system administrator boundary.
 * Enforcement defaults off and disabled mode delegates unchanged to the
 * legacy helper. Enabled configuration and injected dependencies are trusted
 * server-side values only; never populate them from request data. Duplicate
 * headers already discarded or merged by upstream HTTP infrastructure cannot
 * be detected here; conflicting representations still fail closed.
 */
export async function requireAuthenticatedAdminStaffActorForFunction(
  request: any,
  configuration: AuthenticatedAdminStaffActorConfiguration = {},
  dependencies: AuthenticatedAdminStaffActorDependencies = {}
): Promise<RequiredAdminStaffActor> {
  if (
    configuration.enforcementEnabled !== undefined &&
    typeof configuration.enforcementEnabled !== "boolean"
  ) {
    return denied(403);
  }

  if (configuration.enforcementEnabled !== true) {
    return requireAdminStaffActorForFunction(
      request,
      dependencies.readLegacyStaffIdentity
    );
  }

  const apiKeyAuthorization = requireAdminApiKeyForFunction(request);
  if (!apiKeyAuthorization.ok) {
    return denied(apiKeyAuthorization.status);
  }

  const accessToken = parseBearerToken(request);
  if (!accessToken) {
    return denied(401);
  }

  const claimedActorHeader = readUnambiguousHeader(
    request,
    "x-hope-admin-actor-id"
  );
  if (
    claimedActorHeader.present &&
    (!claimedActorHeader.valid ||
      (claimedActorHeader.valid && !claimedActorHeader.value.trim()))
  ) {
    return denied(403);
  }

  const verificationConfiguration =
    configuration.verificationConfiguration;
  const administratorStaffIds =
    configuration.administratorStaffIds;

  if (!verificationConfiguration || !Array.isArray(administratorStaffIds)) {
    return denied(403);
  }

  const authorizationConfiguration: AuthenticatedStaffAuthorizationConfiguration =
    { administratorStaffIds };

  try {
    const decision = await authorizeAuthenticatedStaffAction(
      accessToken,
      verificationConfiguration,
      "system.admin",
      authorizationConfiguration,
      claimedActorHeader?.present
        ? claimedActorHeader.value.trim()
        : undefined,
      {
        readStaffDirectory: dependencies.readStaffDirectory,
        readCanonicalStaffIdentity:
          dependencies.readCanonicalStaffIdentity,
        resolveSigningKey: dependencies.resolveSigningKey
      }
    );

    if (!decision.allowed) {
      return denied(
        decision.reason === "authentication_failed" ? 401 : 403
      );
    }

    return {
      ok: true,
      actorId: decision.authenticatedStaffId
    };
  } catch {
    return denied(403);
  }
}
