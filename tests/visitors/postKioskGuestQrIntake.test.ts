import assert from "node:assert/strict";
import { test } from "node:test";
import { postKioskGuestQrIntake } from
  "../../src/functions/postKioskGuestQrIntake/index";

const now = Date.parse("2026-11-22T15:00:00Z");
const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const grantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const guest = {
  name: "Synthetic Guest",
  email: "guest@example.invalid",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: false
};

function request() {
  return {
    headers: {
      "x-api-key": "synthetic-api-secret",
      "content-type": "application/json",
      "idempotency-key": id,
      "x-kiosk-guest-qr-grant": "synthetic-grant"
    },
    body: { ...guest }
  };
}

function dependencies(overrides: Record<string, any> = {}): NonNullable<Parameters<typeof postKioskGuestQrIntake>[2]> {
  return {
    nowMs: () => now,
    verifyGrant: () => ({
      grantId,
      expiresAtSeconds: now / 1000 + 3600
    }),
    inspectRetry: async () => "missing",
    reserveGuest: async () => ({ admitted: true }),
    reserveGlobal: async () => ({ admitted: true }),
    submit: async () => ({
      accepted: true,
      status: "recorded"
    }),
    ...overrides
  };
}

async function withFlags(
  action: () => Promise<void>
): Promise<void> {
  const updates: Record<string, string> = {
    WEBSITE_SITE_NAME: "hope-kiosk-acceptance-api",
    HOPE_API_KEY: "synthetic-api-secret",
    HOPE_KIOSK_GUEST_QR_INGRESS_ENABLED: "true",
    HOPE_KIOSK_BACKEND_INGRESS_ENABLED: "true",
    HOPE_KIOSK_PUBLIC_INTAKE_ENABLED: "true",
    HOPE_KIOSK_CAPACITY_GUARD_ENABLED: "true",
    HOPE_KIOSK_GUEST_QR_RATE_LIMIT_ENABLED: "true",
    HOPE_KIOSK_GUEST_QR_SIGNING_SECRET:
      "synthetic-qr-signing-secret-1234567890"
  };

  const old = Object.fromEntries(
    Object.keys(updates).map(key => [
      key, process.env[key]
    ])
  );

  try {
    Object.assign(process.env, updates);
    await action();
  } finally {
    for (const key of Object.keys(updates)) {
      if (old[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = old[key];
      }
    }
  }
}

async function invoke(
  req: any = request(),
  overrides: Record<string, any> = {}
) {
  const ctx: any = {};

  await postKioskGuestQrIntake(
    ctx, req, dependencies(overrides)
  );

  return ctx.res;
}

test("QR admission is disabled by default", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_GUEST_QR_INGRESS_ENABLED;

    const result = await invoke();
    assert.equal(result.status, 404);
  });
});

test("other Azure Function Apps cannot enable QR", async () => {
  await withFlags(async () => {
    process.env.WEBSITE_SITE_NAME = "hope-ai-api-staging";
    const result = await invoke();
    assert.equal(result.status, 404);
  });
});

test("wrong API key denies before grant verification", async () => {
  await withFlags(async () => {
    let verified = false;
    const req = request();
    req.headers["x-api-key"] = "wrong-key";

    const result = await invoke(req, {
      verifyGrant: () => {
        verified = true;
        return null;
      }
    });

    assert.equal(result.status, 401);
    assert.equal(verified, false);
  });
});

test("missing guest grant cannot reach storage", async () => {
  await withFlags(async () => {
    const req: any = request();
    delete req.headers["x-kiosk-guest-qr-grant"];

    let inspected = false;

    const result = await invoke(req, {
      inspectRetry: async () => {
        inspected = true;
        return "missing";
      }
    });

    assert.equal(result.status, 403);
    assert.equal(inspected, false);
  });
});

test("rejected signature cannot inspect retries", async () => {
  await withFlags(async () => {
    let inspected = false;

    const result = await invoke(request(), {
      verifyGrant: () => null,
      inspectRetry: async () => {
        inspected = true;
        return "missing";
      }
    });

    assert.equal(result.status, 403);
    assert.equal(inspected, false);
  });
});

test("missing QR rate-limit feature denies", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_GUEST_QR_RATE_LIMIT_ENABLED;
    assert.equal((await invoke()).status, 404);
  });
});

test("invalid visitor information consumes no slots", async () => {
  await withFlags(async () => {
    let reserved = false;
    const req: any = request();
    req.body.admin = true;

    const result = await invoke(req, {
      reserveGuest: async () => {
        reserved = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 400);
    assert.equal(reserved, false);
  });
});

test("accepted QR submission preserves trusted source", async () => {
  await withFlags(async () => {
    const stages: string[] = [];

    const result = await invoke(request(), {
      inspectRetry: async (_body: any, _id: any, options: any) => {
        assert.equal(options.source, "hope_guest_qr_v1");
        stages.push("preflight");
        return "missing";
      },
      reserveGuest: async (value: string) => {
        assert.equal(value, grantId);
        stages.push("guest");
        return { admitted: true };
      },
      reserveGlobal: async () => {
        stages.push("global");
        return { admitted: true };
      },
      submit: async (_body: any, _id: any, options: any) => {
        assert.equal(options.source, "hope_guest_qr_v1");
        assert.equal(await options.authorizeRequest(), true);
        stages.push("submit");
        return { accepted: true, status: "recorded" };
      }
    });

    assert.equal(result.status, 202);
    assert.deepEqual(stages, [
      "preflight", "guest", "global", "submit"
    ]);

    assert.equal(
      JSON.stringify(result).includes(guest.name),
      false
    );
  });
});

test("matching retry consumes no new capacity", async () => {
  await withFlags(async () => {
    let reserved = false;

    const result = await invoke(request(), {
      inspectRetry: async () => "already_recorded",
      reserveGuest: async () => {
        reserved = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.status, "already_recorded");
    assert.equal(reserved, false);
  });
});

test("conflicting retry is rejected before capacity", async () => {
  await withFlags(async () => {
    let reserved = false;

    const result = await invoke(request(), {
      inspectRetry: async () => "idempotency_conflict",
      reserveGuest: async () => {
        reserved = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 409);
    assert.equal(reserved, false);
  });
});

test("QR quota exhaustion blocks global reservation", async () => {
  await withFlags(async () => {
    let globalCalled = false;

    const result = await invoke(request(), {
      reserveGuest: async () => ({
        admitted: false,
        reason: "capacity_exhausted"
      }),
      reserveGlobal: async () => {
        globalCalled = true;
        return { admitted: true };
      }
    });

    assert.equal(result.status, 429);
    assert.equal(globalCalled, false);
  });
});

test("global quota exhaustion prevents persistence", async () => {
  await withFlags(async () => {
    let submitted = false;

    const result = await invoke(request(), {
      reserveGlobal: async () => ({
        admitted: false,
        reason: "capacity_exhausted"
      }),
      submit: async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      }
    });

    assert.equal(result.status, 429);
    assert.equal(submitted, false);
  });
});

test("storage exceptions return no visitor details", async () => {
  await withFlags(async () => {
    const result = await invoke(request(), {
      reserveGuest: async () => {
        throw new Error("SENSITIVE_SYNTHETIC_STORAGE_ERROR");
      }
    });

    assert.equal(result.status, 503);
    assert.equal(
      JSON.stringify(result).includes("SENSITIVE"),
      false
    );
  });
});

test("unavailable downstream service never accepts", async () => {
  await withFlags(async () => {
    const result = await invoke(request(), {
      submit: async () => ({
        accepted: false,
        status: "disabled"
      })
    });

    assert.equal(result.status, 503);
    assert.equal(result.body.accepted, false);
  });
});