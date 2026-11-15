import assert from "node:assert/strict";
import { test } from "node:test";
import {
  postKioskIntake
} from "../../src/functions/postKioskIntake/index";

const id = "55555555-5555-4555-8555-555555555555";

const guest = {
  name: "Synthetic Guest",
  email: "guest@example.test",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: true
};

function request(key = "synthetic-secret") {
  return {
    headers: {
      "x-api-key": key,
      "content-type": "application/json",
      "idempotency-key": id,
      "x-kiosk-device-pass": "synthetic-device-pass"
    },
    body: guest
  };
}

async function run(
  req: any,
  submit?: any,
  reserveAdmission?: any,
  verifyDevicePass?: any,
  assessDevice?: any,
  reserveDeviceSlot?: any,
  inspectRetry?: any
): Promise<any> {
  const context: any = {};

  await postKioskIntake(
    context,
    req,
    {
      ...(submit ? { submit } : {}),
      reserveAdmission:
        reserveAdmission ??
        (async () => ({ admitted: true })),
      verifyDevicePass:
        verifyDevicePass ??
        (() => ({
          deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          expiresAtSeconds: 1795350000
        })),
      assessDevice:
        assessDevice ??
        (async () => true),
      reserveDeviceSlot:
        reserveDeviceSlot ??
        (async () => ({ admitted: true })),
      inspectRetry:
        inspectRetry ??
        (async () => "missing")
    }
  );

  return context.res;
}

async function withFlags(
  operation: () => Promise<void>
): Promise<void> {
  const previousKey = process.env.HOPE_API_KEY;
  const previousIngress =
    process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED;
  const previousIntake =
    process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;
  const previousCapacity =
    process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED;
  const previousVerification =
    process.env.HOPE_KIOSK_DEVICE_VERIFICATION_ENABLED;
  const previousDeviceCapacity =
    process.env.HOPE_KIOSK_DEVICE_CAPACITY_GUARD_ENABLED;

  process.env.HOPE_API_KEY = "synthetic-secret";
  process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED = "true";
  process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = "true";
  process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED = "true";
  process.env.HOPE_KIOSK_DEVICE_VERIFICATION_ENABLED = "true";
  process.env.HOPE_KIOSK_DEVICE_CAPACITY_GUARD_ENABLED = "true";

  try {
    await operation();
  } finally {
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    };

    restore("HOPE_API_KEY", previousKey);
    restore(
      "HOPE_KIOSK_DEVICE_VERIFICATION_ENABLED",
      previousVerification
    );
    restore(
      "HOPE_KIOSK_DEVICE_CAPACITY_GUARD_ENABLED",
      previousDeviceCapacity
    );
    restore(
      "HOPE_KIOSK_CAPACITY_GUARD_ENABLED",
      previousCapacity
    );
    restore(
      "HOPE_KIOSK_BACKEND_INGRESS_ENABLED",
      previousIngress
    );
    restore(
      "HOPE_KIOSK_PUBLIC_INTAKE_ENABLED",
      previousIntake
    );
  }
}

test("missing API key is denied before submitting", async () => {
  await withFlags(async () => {
    let invoked = false;

    const result = await run(
      request(""),
      async () => {
        invoked = true;
        return { accepted: true, status: "recorded" };
      }
    );

    assert.equal(result.status, 401);
    assert.equal(invoked, false);
  });
});

test("incorrect API key is rejected", async () => {
  await withFlags(async () => {
    const result = await run(request("wrong-secret"));
    assert.equal(result.status, 401);
  });
});

test("backend ingress is disabled by default", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED;
    const result = await run(request());

    assert.equal(result.status, 404);
  });
});

test("unsupported content type is rejected", async () => {
  await withFlags(async () => {
    const req = request();
    req.headers["content-type"] = "text/plain";

    const result = await run(req);

    assert.equal(result.status, 415);
  });
});

test("missing idempotency key is rejected", async () => {
  await withFlags(async () => {
    const req = request();
    req.headers["idempotency-key"] = "";

    const result = await run(req);

    assert.equal(result.status, 400);
  });
});

test("oversized payload is rejected", async () => {
  await withFlags(async () => {
    const req: any = request();
    req.rawBody = "x".repeat(9000);

    const result = await run(req);

    assert.equal(result.status, 413);
  });
});

test("valid server-authorized submission returns receipt", async () => {
  await withFlags(async () => {
    const result = await run(
      request(),
      async (body: any, submissionId: any, deps: any) => {
        assert.equal(submissionId, id);
        assert.equal(body.contactConsent, true);
        assert.equal(
          await deps.authorizeRequest(), true
        );

        return { accepted: true, status: "recorded" };
      }
    );

    assert.equal(result.status, 202);
    assert.deepEqual(result.body, {
      accepted: true,
      status: "recorded"
    });
  });
});

test("retry receipt is non-identifying", async () => {
  await withFlags(async () => {
    const result = await run(
      request(),
      async () => ({
        accepted: true,
        status: "already_recorded"
      })
    );

    assert.equal(result.status, 200);
    assert.equal(
      JSON.stringify(result).includes("Synthetic Guest"),
      false
    );
  });
});

test("conflicting submission returns conflict", async () => {
  await withFlags(async () => {
    const result = await run(
      request(),
      async () => ({
        accepted: false,
        status: "idempotency_conflict"
      })
    );

    assert.equal(result.status, 409);
  });
});

test("disabled downstream service remains denied", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

    const result = await run(request());

    assert.equal(result.status, 403);
  });
});

test("storage exception never leaks visitor details", async () => {
  await withFlags(async () => {
    const result = await run(
      request(),
      async () => {
        throw new Error("Sensitive Synthetic Guest");
      }
    );

    assert.equal(result.status, 503);
    assert.equal(
      JSON.stringify(result).includes("Sensitive"),
      false
    );
  });
});
test("capacity guard is disabled by default", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_CAPACITY_GUARD_ENABLED;

    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      }
    );

    assert.equal(result.status, 404);
    assert.equal(submitted, false);
  });
});

test("exhausted capacity denies submission", async () => {
  await withFlags(async () => {
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => ({
        admitted: false,
        reason: "capacity_exhausted"
      })
    );

    assert.equal(result.status, 429);
    assert.equal(submitted, false);
    assert.equal(
      result.body.error,
      "REGISTRATION_LIMIT_REACHED"
    );
  });
});

test("capacity storage failure cannot submit", async () => {
  await withFlags(async () => {
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        throw new Error("STORAGE_UNAVAILABLE");
      }
    );

    assert.equal(result.status, 503);
    assert.equal(submitted, false);
    assert.equal(
      JSON.stringify(result).includes("STORAGE_UNAVAILABLE"),
      false
    );
  });
});

test("invalid API key cannot reserve capacity", async () => {
  await withFlags(async () => {
    let reserved = false;

    const result = await run(
      request("invalid-key"),
      undefined,
      async () => {
        reserved = true;
        return { admitted: true };
      }
    );

    assert.equal(result.status, 401);
    assert.equal(reserved, false);
  });
});

test("device verification is disabled by default", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_DEVICE_VERIFICATION_ENABLED;

    const result = await run(request());

    assert.equal(result.status, 404);
  });
});

test("missing device pass cannot submit", async () => {
  await withFlags(async () => {
    const req: any = request();
    delete req.headers["x-kiosk-device-pass"];

    let submitted = false;

    const result = await run(
      req,
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      }
    );

    assert.equal(result.status, 403);
    assert.equal(submitted, false);
  });
});

test("invalid device signature denies before capacity", async () => {
  await withFlags(async () => {
    let reserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        reserved = true;
        return { admitted: true };
      },
      () => null
    );

    assert.equal(result.status, 403);
    assert.equal(reserved, false);
    assert.equal(submitted, false);
  });
});

test("revoked device denies before capacity", async () => {
  await withFlags(async () => {
    let reserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        reserved = true;
        return { admitted: true };
      },
      () => ({
        deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expiresAtSeconds: 1795350000
      }),
      async () => false
    );

    assert.equal(result.status, 403);
    assert.equal(reserved, false);
    assert.equal(submitted, false);
  });
});

test("device registry failure prevents submission", async () => {
  await withFlags(async () => {
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      undefined,
      undefined,
      async () => {
        throw new Error("SENSITIVE_REGISTRY_FAILURE");
      }
    );

    assert.equal(result.status, 503);
    assert.equal(submitted, false);
    assert.equal(
      JSON.stringify(result).includes("SENSITIVE_REGISTRY"),
      false
    );
  });
});

test("active verified device reaches submission", async () => {
  await withFlags(async () => {
    let assessed = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => ({ admitted: true }),
      () => ({
        deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expiresAtSeconds: 1795350000
      }),
      async (deviceId: string, expiry: number, deps: any) => {
        assert.equal(
          deviceId,
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        );
        assert.equal(expiry, 1795350000);
        assert.equal(deps.enabled, true);
        assessed = true;
        return true;
      }
    );

    assert.equal(result.status, 202);
    assert.equal(assessed, true);
    assert.equal(submitted, true);
  });
});
test("device-specific capacity gate is default off", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_DEVICE_CAPACITY_GUARD_ENABLED;
    const result = await run(request());
    assert.equal(result.status, 404);
  });
});

test("device limit exhaustion denies before global capacity", async () => {
  await withFlags(async () => {
    let globalReserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        globalReserved = true;
        return { admitted: true };
      },
      undefined,
      undefined,
      async () => ({
        admitted: false,
        reason: "device_capacity_exhausted"
      })
    );

    assert.equal(result.status, 429);
    assert.equal(result.body.error, "DEVICE_RATE_LIMIT_REACHED");
    assert.equal(globalReserved, false);
    assert.equal(submitted, false);
  });
});

test("verified device ID determines the rate-limit identity", async () => {
  await withFlags(async () => {
    let deviceReserved = false;
    let globallyReserved = false;

    const result = await run(
      request(),
      async () => ({ accepted: true, status: "recorded" }),
      async () => {
        globallyReserved = true;
        return { admitted: true };
      },
      () => ({
        deviceId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expiresAtSeconds: 1795350000
      }),
      async () => true,
      async (deviceId: string, deps: any) => {
        assert.equal(
          deviceId,
          "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
        );
        assert.equal(deps.enabled, true);
        deviceReserved = true;
        return { admitted: true };
      }
    );

    assert.equal(result.status, 202);
    assert.equal(deviceReserved, true);
    assert.equal(globallyReserved, true);
  });
});

test("device capacity storage errors fail closed", async () => {
  await withFlags(async () => {
    let globallyReserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        globallyReserved = true;
        return { admitted: true };
      },
      undefined,
      undefined,
      async () => {
        throw new Error("SYNTHETIC_PRIVATE_DEVICE_STORE_ERROR");
      }
    );

    assert.equal(result.status, 503);
    assert.equal(globallyReserved, false);
    assert.equal(submitted, false);
    assert.equal(
      JSON.stringify(result).includes(
        "SYNTHETIC_PRIVATE_DEVICE_STORE_ERROR"
      ),
      false
    );
  });
});

test("revoked device cannot consume device rate-limit slots", async () => {
  await withFlags(async () => {
    let deviceReserved = false;

    const result = await run(
      request(),
      async () => ({ accepted: true, status: "recorded" }),
      undefined,
      undefined,
      async () => false,
      async () => {
        deviceReserved = true;
        return { admitted: true };
      }
    );

    assert.equal(result.status, 403);
    assert.equal(deviceReserved, false);
  });
});
test("completed matching retry bypasses both capacity guards", async () => {
  await withFlags(async () => {
    let deviceReserved = false;
    let globalReserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        globalReserved = true;
        return { admitted: true };
      },
      undefined,
      undefined,
      async () => {
        deviceReserved = true;
        return { admitted: true };
      },
      async () => "already_recorded"
    );

    assert.equal(result.status, 200);
    assert.deepEqual(result.body, {
      accepted: true,
      status: "already_recorded"
    });
    assert.equal(deviceReserved, false);
    assert.equal(globalReserved, false);
    assert.equal(submitted, false);
  });
});

test("conflicting retry bypasses capacity and is rejected", async () => {
  await withFlags(async () => {
    let deviceReserved = false;
    let globalReserved = false;
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      async () => {
        globalReserved = true;
        return { admitted: true };
      },
      undefined,
      undefined,
      async () => {
        deviceReserved = true;
        return { admitted: true };
      },
      async () => "idempotency_conflict"
    );

    assert.equal(result.status, 409);
    assert.equal(result.body.status, "idempotency_conflict");
    assert.equal(deviceReserved, false);
    assert.equal(globalReserved, false);
    assert.equal(submitted, false);
  });
});

test("new submission reserves both limits after preflight", async () => {
  await withFlags(async () => {
    const stages: string[] = [];

    const result = await run(
      request(),
      async () => {
        stages.push("submit");
        return { accepted: true, status: "recorded" };
      },
      async () => {
        stages.push("global");
        return { admitted: true };
      },
      undefined,
      async () => {
        stages.push("registry");
        return true;
      },
      async () => {
        stages.push("device");
        return { admitted: true };
      },
      async () => {
        stages.push("preflight");
        return "missing";
      }
    );

    assert.equal(result.status, 202);
    assert.deepEqual(stages, [
      "registry",
      "preflight",
      "device",
      "global",
      "submit"
    ]);
  });
});

test("revoked device cannot inspect submission existence", async () => {
  await withFlags(async () => {
    let inspected = false;

    const result = await run(
      request(),
      undefined,
      undefined,
      undefined,
      async () => false,
      undefined,
      async () => {
        inspected = true;
        return "already_recorded";
      }
    );

    assert.equal(result.status, 403);
    assert.equal(inspected, false);
  });
});

test("invalid signature cannot inspect submission existence", async () => {
  await withFlags(async () => {
    let inspected = false;

    const result = await run(
      request(),
      undefined,
      undefined,
      () => null,
      undefined,
      undefined,
      async () => {
        inspected = true;
        return "already_recorded";
      }
    );

    assert.equal(result.status, 403);
    assert.equal(inspected, false);
  });
});

test("preflight storage failure denies before capacity", async () => {
  await withFlags(async () => {
    let deviceReserved = false;
    let globalReserved = false;

    const result = await run(
      request(),
      undefined,
      async () => {
        globalReserved = true;
        return { admitted: true };
      },
      undefined,
      undefined,
      async () => {
        deviceReserved = true;
        return { admitted: true };
      },
      async () => {
        throw new Error("SYNTHETIC_PRIVATE_PREFLIGHT_ERROR");
      }
    );

    assert.equal(result.status, 503);
    assert.equal(deviceReserved, false);
    assert.equal(globalReserved, false);
    assert.equal(
      JSON.stringify(result).includes(
        "SYNTHETIC_PRIVATE_PREFLIGHT_ERROR"
      ),
      false
    );
  });
});

test("public intake flag prevents completed retry receipt", async () => {
  await withFlags(async () => {
    delete process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED;

    let inspected = false;

    const result = await run(
      request(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      async () => {
        inspected = true;
        return "already_recorded";
      }
    );

    assert.notEqual(result.status, 200);
    assert.equal(inspected, false);
  });
});

test("unexpected preflight result fails closed", async () => {
  await withFlags(async () => {
    let submitted = false;

    const result = await run(
      request(),
      async () => {
        submitted = true;
        return { accepted: true, status: "recorded" };
      },
      undefined,
      undefined,
      undefined,
      undefined,
      async () => "unexpected"
    );

    assert.equal(result.status, 503);
    assert.equal(submitted, false);
  });
});