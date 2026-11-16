import type { JWTVerifyGetKey } from "jose";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  getKioskBootstrapOwnerAuthorizationConfiguration
} from "../../config/kioskBootstrapOwnerAuthorization";
import {
  assessKioskBootstrapOwnerToken
} from "../../services/authorization/assessKioskBootstrapOwnerToken";

type Dependencies = {
  resolveSigningKey?: JWTVerifyGetKey;
};

function readHeader(req: any, name: string): string {
  const headers = req?.headers;
  const value =
    (typeof headers?.get === "function"
      ? headers.get(name)
      : undefined) ??
    headers?.[name.toLowerCase()] ??
    headers?.[name] ??
    "";

  return typeof value === "string" ? value.trim() : "";
}

function reply(
  context: any,
  status: number,
  verified = false
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body: {
      verified,
      status: verified
        ? "OWNER_TOKEN_VERIFIED_EXECUTION_DISABLED"
        : "OWNER_TOKEN_NOT_VERIFIED",
      executionPermitted: false,
      staffCreationPermitted: false,
      authorizationGranted: false,
      approvalConsumptionPermitted: false
    }
  };
}

/**
 * Internal server-to-server verification only.
 * Browser clients must not call this endpoint directly.
 */
export async function postKioskOwnerVerification(
  context: any,
  req: any,
  dependencies: Dependencies = {}
): Promise<void> {
  if (
    process.env.WEBSITE_SITE_NAME !==
      "hope-kiosk-acceptance-api" ||
    process.env.FEATURE_KIOSK_BOOTSTRAP_OWNER_VERIFICATION !==
      "true"
  ) {
    reply(context, 404);
    return;
  }

  const apiKey = requireApiKeyForFunction(req);

  if (!apiKey.ok) {
    reply(context, apiKey.status);
    return;
  }

  const authorization = readHeader(req, "authorization");
  const bearer = /^Bearer\s+([^\s]+)$/i.exec(authorization);

  if (!bearer) {
    reply(context, 401);
    return;
  }

  let configuration;

  try {
    configuration =
      getKioskBootstrapOwnerAuthorizationConfiguration(
        process.env
      );
  } catch {
    reply(context, 503);
    return;
  }

  if (configuration.verificationConfigured !== true) {
    reply(context, 404);
    return;
  }

  let assessment;

  try {
    assessment = await assessKioskBootstrapOwnerToken(
      bearer[1],
      configuration.verificationConfiguration,
      dependencies.resolveSigningKey
    );
  } catch {
    reply(context, 503);
    return;
  }

  const verified =
    assessment.status ===
      "VERIFIED_OWNER_TOKEN_EXECUTION_DISABLED" &&
    assessment.identityMatched === true &&
    assessment.tokenPermissionVerified === true &&
    assessment.executionPermitted === false &&
    assessment.staffCreationPermitted === false &&
    assessment.approvalConsumptionPermitted === false &&
    assessment.authorizationGranted === false;

  reply(context, verified ? 200 : 401, verified);
}
