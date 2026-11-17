import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  verifyKioskBootstrapOwner,
  type KioskOwnerVerificationConfiguration,
  type OwnerVerificationResult
} from "../../services/staff/verifyKioskBootstrapOwner";

const SITE = "hope-kiosk-acceptance-api";
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DENIED = {
  verified: false,
  status: "NOT_VERIFIED",
  executionPermitted: false,
  staffCreationPermitted: false,
  authorizationGranted: false,
  approvalConsumptionPermitted: false
} as const;

export type KioskOwnerHttpDependencies = {
  verify: (
    token: unknown,
    config: KioskOwnerVerificationConfiguration | null,
    enabled: boolean
  ) => Promise<OwnerVerificationResult>;
};

function readConfiguration():
  KioskOwnerVerificationConfiguration | null {
  const env = process.env;

  if (
    env.WEBSITE_SITE_NAME !== SITE ||
    env.HOPE_KIOSK_OWNER_VERIFICATION_ENABLED !== "true"
  ) {
    return null;
  }

  const tenantId = env.HOPE_ENTRA_TENANT_ID ?? "";
  const ownerId = env.HOPE_KIOSK_OWNER_OBJECT_ID ?? "";
  const clientId = env.AUTH_MICROSOFT_ENTRA_ID_ID ?? "";
  const audience = env.HOPE_ENTRA_API_AUDIENCE ?? "";
  const scopes = (env.HOPE_ENTRA_REQUIRED_SCOPES ?? "")
    .split(",").map(x => x.trim()).filter(Boolean);

  if (
    !GUID.test(tenantId) ||
    !GUID.test(ownerId) ||
    !GUID.test(clientId) ||
    !audience ||
    audience.trim() !== audience ||
    audience.toLowerCase() === clientId.toLowerCase() ||
    scopes.length === 0 ||
    scopes.some(x => !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(x))
  ) {
    return null;
  }

  return {
    tenantId,
    expectedOwnerObjectId: ownerId,
    audience,
    requiredPermissions: { scopes },
    allowedClientApplicationIds: [clientId]
  };
}

function readBearer(req: any): string | null {
  const headers = req?.headers;
  if (!headers || typeof headers.get !== "function") return null;

  const raw: unknown = headers.get("authorization");

  if (typeof raw !== "string" || raw.length > 16400) {
    return null;
  }

  return /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i
    .exec(raw)?.[1] ?? null;
}

export function createKioskOwnerVerificationHandler(
  dependencies: KioskOwnerHttpDependencies
): (context: any, req: any) => Promise<void> {
  return async (context, req) => {
    const respond = (status: number, body: OwnerVerificationResult) => {
      context.res = {
        status,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store"
        },
        body
      };
    };

    // Default deny before reading API keys, tokens, or configuration.
    if (
      process.env.WEBSITE_SITE_NAME !== SITE ||
      process.env.HOPE_KIOSK_OWNER_VERIFICATION_ENABLED !== "true"
    ) {
      respond(404, DENIED);
      return;
    }

    if (req?.method !== "POST") {
      respond(405, DENIED);
      return;
    }

    const auth = requireApiKeyForFunction(req);
    if (!auth.ok) {
      respond(401, DENIED);
      return;
    }

    const configuration = readConfiguration();
    const token = readBearer(req);

    if (!configuration || !token) {
      respond(401, DENIED);
      return;
    }

    try {
      const result = await dependencies.verify(
        token, configuration, true
      );

      if (
        result.verified === true &&
        result.status === "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED" &&
        result.executionPermitted === false &&
        result.staffCreationPermitted === false &&
        result.authorizationGranted === false &&
        result.approvalConsumptionPermitted === false
      ) {
        respond(200, result);
        return;
      }
    } catch {
      // No tokens, identifiers, or verifier errors in logs.
    }

    respond(401, DENIED);
  };
}

export const postKioskOwnerVerification =
  createKioskOwnerVerificationHandler({
    verify: verifyKioskBootstrapOwner
  });
