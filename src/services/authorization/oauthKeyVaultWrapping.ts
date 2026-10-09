/**
 * Key Vault key-wrapping boundary. No Azure SDK or network calls.
 * The injected client must be supplied by separately authorized code.
 */

export const OAUTH_KEY_WRAP_ALGORITHM = "RSA-OAEP-256" as const;

export interface OAuthWrappedDataKey {
  keyReference: string;
  wrappingAlgorithm: typeof OAUTH_KEY_WRAP_ALGORITHM;
  wrappedDataKey: string;
}

export interface OAuthKeyWrapClient {
  wrapKey(
    keyReference: string,
    algorithm: typeof OAUTH_KEY_WRAP_ALGORITHM,
    dataKey: Buffer
  ): Promise<{
    keyReference: string;
    algorithm: string;
    result: Buffer;
  }>;

  unwrapKey(
    keyReference: string,
    algorithm: typeof OAUTH_KEY_WRAP_ALGORITHM,
    wrappedKey: Buffer
  ): Promise<{
    keyReference: string;
    algorithm: string;
    result: Buffer;
  }>;
}

export interface OAuthKeyWrapPolicy {
  currentKeyReference: string;
  permittedKeyReferences: readonly string[];
}

const keyUriPattern =
  /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/[a-z0-9-]+\/[0-9a-f]{32}$/;

function validKeyReference(value: unknown): value is string {
  return typeof value === "string" && keyUriPattern.test(value);
}

function assertPolicy(policy: OAuthKeyWrapPolicy): void {
  if (
    !policy ||
    !validKeyReference(policy.currentKeyReference) ||
    !Array.isArray(policy.permittedKeyReferences) ||
    policy.permittedKeyReferences.length === 0 ||
    !policy.permittedKeyReferences.every(validKeyReference) ||
    !policy.permittedKeyReferences.includes(policy.currentKeyReference) ||
    new Set(policy.permittedKeyReferences).size !==
      policy.permittedKeyReferences.length
  ) {
    throw new Error("Invalid OAuth key policy");
  }
}

function assertDataKey(value: unknown): asserts value is Buffer {
  if (!Buffer.isBuffer(value) || value.length !== 32) {
    throw new Error("Invalid OAuth data-encryption key");
  }
}

function decodeWrapped(value: unknown): Buffer {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]+$/.test(value) ||
    value.length % 4 === 1
  ) {
    throw new Error("Invalid wrapped OAuth data key");
  }

  const decoded = Buffer.from(value, "base64url");

  if (
    decoded.toString("base64url") !== value ||
    decoded.length < 128 ||
    decoded.length > 1024
  ) {
    throw new Error("Invalid wrapped OAuth data key");
  }

  return decoded;
}

function validateClientResult(
  value: unknown,
  expectedReference: string
): Buffer {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error("OAuth key operation failed");
  }

  const response = value as Record<string, unknown>;

  if (
    response.keyReference !== expectedReference ||
    response.algorithm !== OAUTH_KEY_WRAP_ALGORITHM ||
    !Buffer.isBuffer(response.result)
  ) {
    throw new Error("OAuth key operation failed");
  }

  return response.result as Buffer;
}

/**
 * Wraps a 256-bit data key with the current approved key version.
 * No result may be persisted until a higher-level envelope validator
 * and authenticated authorization boundary are implemented.
 */
export async function wrapOAuthDataKey(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  dataKey: Buffer
): Promise<OAuthWrappedDataKey> {
  assertPolicy(policy);
  assertDataKey(dataKey);

  const reference = policy.currentKeyReference;

  try {
    const result = validateClientResult(
      await client.wrapKey(reference, OAUTH_KEY_WRAP_ALGORITHM, dataKey),
      reference
    );

    const encoded = result.toString("base64url");
    decodeWrapped(encoded);

    return {
      keyReference: reference,
      wrappingAlgorithm: OAUTH_KEY_WRAP_ALGORITHM,
      wrappedDataKey: encoded
    };
  } catch {
    throw new Error("OAuth key wrapping failed");
  }
}

/**
 * Unwraps using only an explicitly permitted versioned key reference.
 * This is a cryptographic primitive, NOT session authorization.
 */
export async function unwrapOAuthDataKey(
  client: OAuthKeyWrapClient,
  policy: OAuthKeyWrapPolicy,
  wrapped: OAuthWrappedDataKey
): Promise<Buffer> {
  assertPolicy(policy);

  if (
    !wrapped ||
    typeof wrapped !== "object" ||
    Array.isArray(wrapped) ||
    Object.keys(wrapped).length !== 3 ||
    !Object.keys(wrapped).every((key) =>
      ["keyReference", "wrappingAlgorithm", "wrappedDataKey"].includes(key)
    ) ||
    wrapped.wrappingAlgorithm !== OAUTH_KEY_WRAP_ALGORITHM ||
    !validKeyReference(wrapped.keyReference) ||
    !policy.permittedKeyReferences.includes(wrapped.keyReference)
  ) {
    throw new Error("Unapproved OAuth key reference");
  }

  const bytes = decodeWrapped(wrapped.wrappedDataKey);

  try {
    const result = validateClientResult(
      await client.unwrapKey(
        wrapped.keyReference,
        OAUTH_KEY_WRAP_ALGORITHM,
        bytes
      ),
      wrapped.keyReference
    );

    assertDataKey(result);
    return result;
  } catch {
    throw new Error("OAuth key unwrapping failed");
  }
}
