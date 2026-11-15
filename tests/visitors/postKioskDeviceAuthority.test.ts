import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postKioskDeviceAuthority
} from "../../src/functions/postKioskDeviceAuthority/index";

const id = "88888888-8888-4888-8888-888888888888";
const authority = "synthetic-device-authority-secret-only-123456";
const expiry = Math.floor(
  Date.parse("2026-11-22T16:00:00Z") / 1000
);

function request(
  body: any,
  apiKey = "synthetic-hope-key",
  authorityKey = authority
): any {
  return {
    headers: {
      "x-api-key": apiKey,
      "x-kiosk-device-authority-key": authorityKey,
      "content-type": "application/json"
    },
    body
  };
}

async function execute(
  req: any,
  deps: any = {}
): Promise<any> {
  const context: any = {};

  await postKioskDeviceAuthority(context, req, deps);

  return context.res;
}

async function withSettings(
  action: () => Promise<void>
): Promise<void> {
  const names = [
    "HOPE_API_KEY",
    "HOPE_KIOSK_DEVICE_AUTHORITY_KEY",
    "HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED"
  ];

  const previous = new Map(
    names.map(name => [name, process.env[name]])
  );

  process.env.HOPE_API_KEY = "synthetic-hope-key";
  process.env.HOPE_KIOSK_DEVICE_AUTHORITY_KEY = authority;
  process.env.HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED = "true";

  try {
    await action();
  } finally {
    for (const name of names) {
      const old = previous.get(name);

      if (old === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = old;
      }
    }
  }
}

test("invalid HOPE API key denies authority", async () => {
  await withSettings(async () => {
    let called = false;

    const response = await execute(
      request(
        { action: "register", deviceId: id,
          expiresAtSeconds: expiry },
        "incorrect-api-key"
      ),
      { register: async () => { called = true; } }
    );

    assert.equal(response.status, 401);
    assert.equal(called, false);
  });
});

test("authority disabled by default denies operation", async () => {
  await withSettings(async () => {
    delete process.env.HOPE_KIOSK_DEVICE_AUTHORITY_ENABLED;

    const response = await execute(
      request({ action: "revoke", deviceId: id })
    );

    assert.equal(response.status, 404);
  });
});

test("missing separate authority key is denied", async () => {
  await withSettings(async () => {
    let called = false;

    const response = await execute(
      request(
        { action: "revoke", deviceId: id },
        "synthetic-hope-key",
        ""
      ),
      { revoke: async () => {
          called = true;
          return "revoked";
        }
      }
    );

    assert.equal(response.status, 403);
    assert.equal(called, false);
  });
});

test("wrong separate authority key is denied", async () => {
  await withSettings(async () => {
    const response = await execute(
      request(
        { action: "revoke", deviceId: id },
        "synthetic-hope-key",
        "another-synthetic-authority-secret-123456"
      )
    );

    assert.equal(response.status, 403);
  });
});

test("valid trusted registration returns minimal receipt", async () => {
  await withSettings(async () => {
    let registered = false;

    const response = await execute(
      request({
        action: "register",
        deviceId: id,
        expiresAtSeconds: expiry
      }),
      {
        register: async (
          deviceId: string,
          exp: number,
          deps: any
        ) => {
          assert.equal(deviceId, id);
          assert.equal(exp, expiry);
          assert.equal(deps.enabled, true);
          registered = true;
        }
      }
    );

    assert.equal(registered, true);
    assert.equal(response.status, 201);
    assert.deepEqual(response.body, {
      ok: true,
      status: "registered"
    });
  });
});

test("valid trusted revocation is accepted", async () => {
  await withSettings(async () => {
    const response = await execute(
      request({ action: "revoke", deviceId: id }),
      {
        revoke: async () => "revoked"
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "revoked");
  });
});

test("repeated revocation is accepted", async () => {
  await withSettings(async () => {
    const response = await execute(
      request({ action: "revoke", deviceId: id }),
      {
        revoke: async () => "already_revoked"
      }
    );

    assert.equal(response.status, 200);
    assert.equal(response.body.status, "already_revoked");
  });
});

test("unexpected input fields are rejected", async () => {
  await withSettings(async () => {
    const response = await execute(
      request({
        action: "register",
        deviceId: id,
        expiresAtSeconds: expiry,
        adminOverride: true
      })
    );

    assert.equal(response.status, 400);
  });
});

test("invalid device ID is denied", async () => {
  await withSettings(async () => {
    const response = await execute(
      request({
        action: "revoke",
        deviceId: "../other-device"
      })
    );

    assert.equal(response.status, 400);
  });
});

test("storage exception fails closed without leakage", async () => {
  await withSettings(async () => {
    const response = await execute(
      request({ action: "revoke", deviceId: id }),
      {
        revoke: async () => {
          throw new Error(
            "secret-storage-error-synthetic"
          );
        }
      }
    );

    assert.equal(response.status, 503);
    assert.equal(
      JSON.stringify(response).includes("secret-storage"),
      false
    );
  });
});

test("oversized authority request is rejected", async () => {
  await withSettings(async () => {
    const req = request({
      action: "revoke",
      deviceId: id
    });

    req.rawBody = "x".repeat(700);

    const response = await execute(req);

    assert.equal(response.status, 413);
  });
});

test("weak configured authority key is rejected", async () => {
  await withSettings(async () => {
    process.env.HOPE_KIOSK_DEVICE_AUTHORITY_KEY = "short";

    const response = await execute(
      request({ action: "revoke", deviceId: id })
    );

    assert.equal(response.status, 403);
  });
});