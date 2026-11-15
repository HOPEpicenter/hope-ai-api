import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import { requireApiKeyForFunction } from "../_shared/apiKey";
import {
  registerKioskDeviceV1,
  revokeKioskDeviceV1
} from "../../services/visitors/kioskDeviceRegistryV1";

const MAX_BODY_BYTES = 512;
const UUID4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type Dependencies = {
  register?: typeof registerKioskDeviceV1;
  revoke?: typeof revokeKioskDeviceV1;
};

function header(req: any, name: string): string {
  const h = req?.headers;
  const value =
    (typeof h?.get === "function"
      ? h.get(name)
      : undefined) ??
    h?.[name] ??
    h?.[name.toLowerCase()];

  return typeof value === "string" ? value.trim() : "";
}

function respond(
  context: any,
  status: number,
  body: Record<string, unknown>
): void {
  context.res = {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    },
    body
  };
}

function authoritySecretIsValid(req: any): boolean {
  const configured =
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_KEY ?? "";
  const supplied = header(req, "x-kiosk-device-authority-key");

  if (
    Buffer.byteLength(configured, "utf8") < 32 ||
    Buffer.byteLength(supplied, "utf8") < 32 ||
    Buffer.byteLength(supplied, "utf8") > 256
  ) {
    return false;
  }

  const expected = Buffer.from(configured, "utf8");
  const actual = Buffer.from(supplied, "utf8");

  return (
    expected.length === actual.length &&
    timingSafeEqual(actual, expected)
  );
}

/**
 * Internal server-to-server device authority.
 *
 * A validated HOPE API key alone does not authorize device
 * registration or revocation. The independent authority key
 * is required as an additional server-only credential.
 *
 * The dashboard administrator route must authorize the
 * human actor before calling this endpoint.
 *
 * Never make this endpoint publicly callable from an iPad.
 */
export async function postKioskDeviceAuthority(
  context: any,
  req: any,
  deps: Dependencies = {}
): Promise<void> {
  const auth = requireApiKeyForFunction(req);

  if (!auth.ok) {
    respond(context, auth.status, {
      ok: false,
      error: "NOT_AUTHORIZED"
    });
    return;
  }

  if (
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED !== "true"
  ) {
    respond(context, 404, {
      ok: false,
      error: "NOT_AVAILABLE"
    });
    return;
  }

  if (!authoritySecretIsValid(req)) {
    respond(context, 403, {
      ok: false,
      error: "NOT_AUTHORIZED"
    });
    return;
  }

  if (
    !/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      header(req, "content-type")
    )
  ) {
    respond(context, 415, {
      ok: false,
      error: "UNSUPPORTED_MEDIA_TYPE"
    });
    return;
  }

  const body = req?.body;

  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    respond(context, 400, {
      ok: false,
      error: "INVALID_REQUEST"
    });
    return;
  }

  try {
    const raw = req?.rawBody;
    const size =
      typeof raw === "string" || Buffer.isBuffer(raw)
        ? Buffer.byteLength(raw)
        : Buffer.byteLength(JSON.stringify(body));

    if (size > MAX_BODY_BYTES) {
      respond(context, 413, {
        ok: false,
        error: "REQUEST_TOO_LARGE"
      });
      return;
    }

    const fields = Object.keys(body).sort();
    const action = body.action;
    const deviceId = body.deviceId;

    if (
      !UUID4.test(deviceId) ||
      (
        action !== "register" &&
        action !== "revoke"
      )
    ) {
      respond(context, 400, {
        ok: false,
        error: "INVALID_REQUEST"
      });
      return;
    }

    if (action === "register") {
      if (
        fields.join(",") !==
          "action,deviceId,expiresAtSeconds" ||
        !Number.isSafeInteger(body.expiresAtSeconds)
      ) {
        respond(context, 400, {
          ok: false,
          error: "INVALID_REQUEST"
        });
        return;
      }

      const register = deps.register ?? registerKioskDeviceV1;

      await register(deviceId, body.expiresAtSeconds, {
        enabled: true
      });

      respond(context, 201, {
        ok: true,
        status: "registered"
      });
      return;
    }

    if (fields.join(",") !== "action,deviceId") {
      respond(context, 400, {
        ok: false,
        error: "INVALID_REQUEST"
      });
      return;
    }

    const revoke = deps.revoke ?? revokeKioskDeviceV1;
    const status = await revoke(deviceId, {
      enabled: true
    });

    respond(context, 200, {
      ok: true,
      status
    });
  } catch {
    // Never disclose secrets, identifiers or storage errors.
    respond(context, 503, {
      ok: false,
      error: "DEVICE_AUTHORITY_UNAVAILABLE"
    });
  }
}