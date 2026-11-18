import {
  verifyEntraStaffAccessToken
} from "./verifyEntraStaffAccessToken";

const SITE = "hope-kiosk-acceptance-api";
const TENANT = "783ef4b1-7e96-4a71-80dd-06865b015da9";
const REQUIRED_SCOPE = "kiosk.device.pair";
const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const FULL_GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type KioskOwnerPairingDecision = Readonly<{
  authorized: boolean;
  staffAuthorityGranted: false;
  staffCreationPermitted: false;
}>;

const DENIED: KioskOwnerPairingDecision = Object.freeze({
  authorized: false,
  staffAuthorityGranted: false,
  staffCreationPermitted: false
});

const APPROVED: KioskOwnerPairingDecision = Object.freeze({
  authorized: true,
  staffAuthorityGranted: false,
  staffCreationPermitted: false
});

/**
 * Authorizes only the isolated kiosk's device-pairing operation.
 *
 * Never pass caller-supplied configuration into this function.
 * The environment must belong to the trusted backend runtime.
 *
 * This does not create Staff, authorize Staff operations, or
 * register a device. Device registration requires a separate
 * authenticated, authorized service boundary.
 */
export async function authorizeKioskOwnerPairing(
  accessToken: unknown
): Promise<KioskOwnerPairingDecision> {
  if (
    process.env.WEBSITE_SITE_NAME !== SITE ||
    process.env.FEATURE_KIOSK_OWNER_PAIRING !== "true"
  ) {
    return DENIED;
  }

  const owner = process.env.KIOSK_PAIRING_OWNER_OBJECT_ID ?? "";
  const audience = process.env.KIOSK_PAIRING_API_AUDIENCE ?? "";
  const client = process.env.KIOSK_PAIRING_CLIENT_APPLICATION_ID ?? "";

  if (
    !FULL_GUID.test(owner) ||
    owner !== owner.toLowerCase() ||
    !FULL_GUID.test(client) ||
    client !== client.toLowerCase() ||
    !audience ||
    audience.trim() !== audience ||
    audience.length > 256 ||
    /\s/.test(audience) ||
    audience.toLowerCase() === client ||
    audience.toLowerCase() === `api://${client}` ||
    typeof accessToken !== "string" ||
    accessToken.length < 20 ||
    accessToken.length > 16384
  ) {
    return DENIED;
  }

  try {
    const verified = await verifyEntraStaffAccessToken(
      accessToken,
      {
        tenantId: TENANT,
        audience,
        requiredPermissions: {
          scopes: [REQUIRED_SCOPE]
        },
        allowedClientApplicationIds: [client]
      }
    );

    return (
      verified.tenantId === TENANT &&
      verified.objectId === owner &&
      verified.scopes.includes(REQUIRED_SCOPE)
    ) ? APPROVED : DENIED;
  } catch {
    return DENIED;
  }
}