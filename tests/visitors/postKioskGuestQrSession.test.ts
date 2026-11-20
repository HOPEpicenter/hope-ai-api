import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postKioskGuestQrSession
} from "../../src/functions/postKioskGuestQrSession/index";
import {
  verifyKioskGuestQrGrantV1
} from "../../src/services/visitors/kioskGuestQrGrantV1";

const sunday = Date.parse("2026-11-22T15:00:00Z");
const secret = "synthetic-qr-session-secret-123456789abcdef";

function request() {
  return {
    headers: {
      "x-api-key": "synthetic-api-key",
      "content-type": "application/json"
    },
    body: {
      intent: "start-guest-phone-registration"
    }
  };
}

function defaults() {
  const flags: Record<string, string> = {
    WEBSITE_SITE_NAME: "hope-kiosk-acceptance-api",
    HOPE_API_KEY: "synthetic-api-key",
    HOPE_KIOSK_GUEST_QR_SESSION_ENABLED: "true",
    HOPE_KIOSK_GUEST_QR_OWNER_ACTIVATED: "true",
    HOPE_KIOSK_GUEST_QR_INGRESS_ENABLED: "true",
    HOPE_KIOSK_GUEST_QR_RATE_LIMIT_ENABLED: "true",
    HOPE_KIOSK_BACKEND_INGRESS_ENABLED: "true",
    HOPE_KIOSK_PUBLIC_INTAKE_ENABLED: "true",
    HOPE_KIOSK_CAPACITY_GUARD_ENABLED: "true",
    HOPE_KIOSK_GUEST_QR_SIGNING_SECRET: secret
  };

  return flags;
}

async function withFlags(action: () => Promise<void>) {
  const flags = defaults();
  const old: Record<string, string | undefined> = {};

  for (const key of Object.keys(flags)) {
    old[key] = process.env[key];
    process.env[key] = flags[key];
  }

  try {
    await action();
  } finally {
    for (const key of Object.keys(flags)) {
      if (old[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = old[key];
      }
    }
  }
}

type Dependencies = NonNullable<
  Parameters<typeof postKioskGuestQrSession>[2]
>;

async function invoke(
  req: any = request(),
  deps: Dependencies = {}
) {
  const ctx: any = {};

  await postKioskGuestQrSession(ctx, req, {
    nowMs: () => sunday,
    reserveIssue: async () => ({ admitted: true }),
    ...deps
  });

  return ctx.res;
}

test("session issuance disabled by default", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_GUEST_QR_SESSION_ENABLED;

    assert.equal((await invoke()).status, 404);
  });
});

test("owner activation is mandatory", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_GUEST_QR_OWNER_ACTIVATED;
    let reserved = false;

    const result = await invoke(request(), {
      reserveIssue: async () => {
        reserved = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 404);
    assert.equal(reserved, false);
  });
});

test("other Function Apps cannot issue grants", async () => {
  await withFlags(async () => {
    process.env.WEBSITE_SITE_NAME = "hope-ai-api-staging";

    assert.equal((await invoke()).status, 404);
  });
});

test("wrong API key cannot consume issuance quota", async () => {
  await withFlags(async () => {
    let reserved = false;
    const req = request();
    req.headers["x-api-key"] = "wrong-key";

    const result = await invoke(req, {
      reserveIssue: async () => {
        reserved = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 401);
    assert.equal(reserved, false);
  });
});

test("invalid request denied before issuance", async () => {
  await withFlags(async () => {
    const req: any = request();
    req.body = { intent: "other" };

    assert.equal((await invoke(req)).status, 400);
  });
});

test("no session issued before Sunday", async () => {
  await withFlags(async () => {
    const result = await invoke(request(), {
      nowMs: () =>
        Date.parse("2026-11-21T15:00:00Z")
    });

    assert.equal(result.status, 404);
  });
});

test("atomic issuance quota exhaustion denies", async () => {
  await withFlags(async () => {
    const result = await invoke(request(), {
      reserveIssue: async () => ({
        admitted: false,
        reason: "capacity_exhausted"
      })
    });

    assert.equal(result.status, 429);
    assert.equal(result.body.grant, undefined);
  });
});

test("successful session yields verifiable Sunday grant", async () => {
  await withFlags(async () => {
    let bucketVerified = false;

    const result = await invoke(request(), {
      reserveIssue: async (bucket, options) => {
        assert.equal(
          bucket,
          "ffffffff-ffff-4fff-8fff-ffffffffffff"
        );
        assert.equal(options?.capacity, 30);
        bucketVerified = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 201);
    assert.equal(bucketVerified, true);
    assert.equal(result.body.ok, true);

    const verified = verifyKioskGuestQrGrantV1(
      result.body.grant,
      secret,
      { enabled: true },
      sunday
    );

    assert.ok(verified);
    assert.equal(
      verified.expiresAtSeconds,
      sunday / 1000 + 3600
    );
  });
});

test("invalid signing configuration fails closed", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_GUEST_QR_SIGNING_SECRET;

    const result = await invoke();

    assert.equal(result.status, 503);
    assert.equal(result.body.grant, undefined);
  });
});

test("storage failure leaks neither credentials nor PII", async () => {
  await withFlags(async () => {
    const result = await invoke(request(), {
      reserveIssue: async () => {
        throw new Error("SYNTHETIC_SECRET_STORAGE_FAILURE");
      }
    });

    assert.equal(result.status, 503);
    assert.equal(
      JSON.stringify(result).includes("SYNTHETIC_SECRET"),
      false
    );
    assert.equal(result.body.grant, undefined);
  });
});