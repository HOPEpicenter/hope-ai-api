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
      "idempotency-key": id
    },
    body: guest
  };
}

async function run(
  req: any,
  submit?: any
): Promise<any> {
  const context: any = {};

  await postKioskIntake(
    context,
    req,
    submit ? { submit } : {}
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

  process.env.HOPE_API_KEY = "synthetic-secret";
  process.env.HOPE_KIOSK_BACKEND_INGRESS_ENABLED = "true";
  process.env.HOPE_KIOSK_PUBLIC_INTAKE_ENABLED = "true";

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