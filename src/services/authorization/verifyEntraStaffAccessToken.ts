import {
  customFetch,
  createRemoteJWKSet,
  jwtVerify,
  type FetchImplementation,
  type JWTVerifyGetKey,
  type JWTPayload,
  type RemoteJWKSetOptions
} from "jose";

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ENTRA_AUTHORITY = "https://login.microsoftonline.com";
// jose fails closed on JWKS fetch errors; unknown keys are refreshed after cooldown.
const ENTRA_JWKS_OPTIONS: Pick<
  RemoteJWKSetOptions,
  "timeoutDuration" | "cacheMaxAge" | "cooldownDuration"
> = {
  timeoutDuration: 5000,
  cacheMaxAge: 10 * 60 * 1000,
  cooldownDuration: 30 * 1000
};
const signingKeyResolvers = new Map<string, JWTVerifyGetKey>();

export type EntraStaffTokenVerificationConfiguration = {
  tenantId: string;
  audience: string;
  requiredPermissions: {
    scopes?: readonly string[];
    roles?: readonly string[];
  };
  allowedClientApplicationIds?: readonly string[];
};

export type VerifiedEntraStaffAccessToken = {
  tenantId: string;
  objectId: string;
  scopes: readonly string[];
  roles: readonly string[];
};

function validateTenantId(tenantIdInput: unknown): string {
  if (typeof tenantIdInput !== "string") {
    throw new Error("Entra tenant ID must be configured as a GUID");
  }

  const tenantId = tenantIdInput.trim().toLowerCase();

  if (!GUID_PATTERN.test(tenantId)) {
    throw new Error("Entra tenant ID must be configured as a GUID");
  }

  return tenantId;
}

function validatePermissions(
  permissions: EntraStaffTokenVerificationConfiguration["requiredPermissions"]
): { scopes: readonly string[]; roles: readonly string[] } {
  if (!permissions || typeof permissions !== "object") {
    throw new Error("At least one API scope or app role must be configured");
  }

  const scopes = permissions.scopes ?? [];
  const roles = permissions.roles ?? [];
  const isValidList = (values: readonly string[]): boolean =>
    Array.isArray(values) &&
    values.every(
      value =>
        typeof value === "string" &&
        value.length > 0 &&
        value.trim() === value &&
        !/\s/.test(value)
    );

  if (
    !isValidList(scopes) ||
    !isValidList(roles) ||
    (scopes.length === 0 && roles.length === 0)
  ) {
    throw new Error("At least one valid API scope or app role must be configured");
  }

  return {
    scopes: [...new Set(scopes)],
    roles: [...new Set(roles)]
  };
}

function validateClientApplicationIds(
  applicationIds: readonly string[] | undefined
): readonly string[] | undefined {
  if (applicationIds === undefined) {
    return undefined;
  }

  if (
    !Array.isArray(applicationIds) ||
    applicationIds.length === 0 ||
    !applicationIds.every(
      applicationId =>
        typeof applicationId === "string" &&
        GUID_PATTERN.test(applicationId)
    )
  ) {
    throw new Error(
      "Configured Entra client application IDs must be a nonempty list of GUIDs"
    );
  }

  return [
    ...new Set(applicationIds.map(applicationId => applicationId.toLowerCase()))
  ];
}

function createTenantDiscoveryUrl(tenantId: string): string {
  return `${ENTRA_AUTHORITY}/${tenantId}/v2.0/.well-known/openid-configuration`;
}

function createTenantJwksUrl(tenantId: string): string {
  return `${ENTRA_AUTHORITY}/${tenantId}/discovery/v2.0/keys`;
}

export function createEntraTenantSigningKeyResolver(
  tenantIdInput: string,
  fetchDiscovery: typeof fetch = fetch,
  fetchJwks: FetchImplementation = (url, options) =>
    fetch(url, options)
): JWTVerifyGetKey {
  const tenantId = validateTenantId(tenantIdInput);
  const expectedIssuer = `${ENTRA_AUTHORITY}/${tenantId}/v2.0`;
  const expectedJwksUrl = createTenantJwksUrl(tenantId);
  let keySetPromise:
    | Promise<ReturnType<typeof createRemoteJWKSet>>
    | undefined;

  return async (protectedHeader, token) => {
    if (!keySetPromise) {
      keySetPromise = (async () => {
        const response = await fetchDiscovery(
          createTenantDiscoveryUrl(tenantId),
          {
            headers: { accept: "application/json" },
            redirect: "error",
            signal: AbortSignal.timeout(5000)
          }
        );

        if (!response.ok) {
          throw new Error(
            `Microsoft Entra discovery request failed with status ${response.status}`
          );
        }

        const metadata: unknown = await response.json();

        if (
          !metadata ||
          typeof metadata !== "object" ||
          !("issuer" in metadata) ||
          metadata.issuer !== expectedIssuer ||
          !("jwks_uri" in metadata) ||
          metadata.jwks_uri !== expectedJwksUrl
        ) {
          throw new Error(
            "Microsoft Entra discovery metadata did not match the configured tenant"
          );
        }

        return createRemoteJWKSet(new URL(expectedJwksUrl), {
          ...ENTRA_JWKS_OPTIONS,
          [customFetch]: fetchJwks
        });
      })().catch(error => {
        keySetPromise = undefined;
        throw error;
      });
    }

    const resolveKey = await keySetPromise;
    return resolveKey(protectedHeader, token);
  };
}

function getSigningKeyResolver(tenantId: string): JWTVerifyGetKey {
  const existingResolver = signingKeyResolvers.get(tenantId);

  if (existingResolver) {
    return existingResolver;
  }

  const resolver = createEntraTenantSigningKeyResolver(tenantId);
  signingKeyResolvers.set(tenantId, resolver);
  return resolver;
}

function isNumericDate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readStringArrayClaim(
  payload: JWTPayload,
  claimName: "roles"
): string[] {
  const claim = payload[claimName];

  if (!Array.isArray(claim)) {
    return [];
  }

  return claim.filter(
    (value): value is string =>
      typeof value === "string" && value.length > 0
  );
}

function readScopes(payload: JWTPayload): string[] {
  const claim = payload.scp;

  if (typeof claim !== "string") {
    return [];
  }

  return claim.split(/\s+/).filter(Boolean);
}

/**
 * ID-token marker claims are rejected as defense in depth, not as complete
 * token-type verification. Correct separation requires distinct API audience
 * and permission configuration for access tokens versus ID tokens.
 */
export async function verifyEntraStaffAccessToken(
  accessToken: string,
  configuration: EntraStaffTokenVerificationConfiguration,
  resolveSigningKey?: JWTVerifyGetKey
): Promise<VerifiedEntraStaffAccessToken> {
  const tenantId = validateTenantId(configuration?.tenantId);
  const audience = configuration?.audience;

  if (
    typeof audience !== "string" ||
    audience.length === 0 ||
    audience.trim() !== audience
  ) {
    throw new Error("Backend API audience must be configured");
  }

  const requiredPermissions = validatePermissions(
    configuration.requiredPermissions
  );
  const allowedClientApplicationIds = validateClientApplicationIds(
    configuration.allowedClientApplicationIds
  );
  const signingKeyResolver =
    resolveSigningKey ?? getSigningKeyResolver(tenantId);
  const expectedIssuer = `${ENTRA_AUTHORITY}/${tenantId}/v2.0`;
  const { payload } = await jwtVerify(accessToken, signingKeyResolver, {
    algorithms: ["RS256"],
    issuer: expectedIssuer,
    audience
  });

  if (payload.aud !== audience) {
    throw new Error("Access token audience must exactly match the backend API");
  }

  if (
    payload.nonce !== undefined ||
    payload.at_hash !== undefined ||
    payload.c_hash !== undefined
  ) {
    throw new Error("OpenID Connect ID tokens cannot be used as API access tokens");
  }

  const objectId = payload.oid;
  const issuedAt = payload.iat;
  const expiresAt = payload.exp;

  if (payload.ver !== "2.0") {
    throw new Error("Only Microsoft Entra v2 access tokens are accepted");
  }

  if (allowedClientApplicationIds !== undefined) {
    const clientApplicationId = payload.azp;

    if (
      typeof clientApplicationId !== "string" ||
      !GUID_PATTERN.test(clientApplicationId) ||
      !allowedClientApplicationIds.includes(
        clientApplicationId.toLowerCase()
      )
    ) {
      throw new Error(
        "Access token client application is not authorized"
      );
    }
  }

  if (
    typeof payload.tid !== "string" ||
    !GUID_PATTERN.test(payload.tid) ||
    payload.tid.toLowerCase() !== tenantId
  ) {
    throw new Error("Access token tenant does not match the configured tenant");
  }

  if (typeof objectId !== "string" || !GUID_PATTERN.test(objectId)) {
    throw new Error("Access token must contain a valid object ID");
  }

  if (
    !isNumericDate(issuedAt) ||
    !isNumericDate(expiresAt) ||
    expiresAt <= issuedAt ||
    issuedAt > Math.floor(Date.now() / 1000)
  ) {
    throw new Error("Access token must contain valid iat and exp claims");
  }

  const scopes = readScopes(payload);
  const roles = readStringArrayClaim(payload, "roles");
  const acceptedScopes = scopes.filter(scope =>
    requiredPermissions.scopes.includes(scope)
  );
  const acceptedRoles = roles.filter(role =>
    requiredPermissions.roles.includes(role)
  );

  if (acceptedScopes.length === 0 && acceptedRoles.length === 0) {
    throw new Error("Access token lacks a configured API scope or app role");
  }

  return {
    tenantId,
    objectId: objectId.toLowerCase(),
    scopes: acceptedScopes,
    roles: acceptedRoles
  };
}
