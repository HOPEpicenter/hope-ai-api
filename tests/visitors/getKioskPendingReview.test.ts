import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGetKioskPendingReviewHandler
} from "../../src/functions/getKioskPendingReview/index";

const FLAG = "HOPE_KIOSK_STAFF_REVIEW_ENABLED";

async function withFlag(
  enabled: boolean,
  operation: () => Promise<void>
): Promise<void> {
  const previous = process.env[FLAG];

  try {
    if (enabled) {
      process.env[FLAG] = "true";
    } else {
      delete process.env[FLAG];
    }

    await operation();
  } finally {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  }
}

function pendingBatch() {
  return {
    event: "friends-family-2026-11-22" as const,
    items: [],
    limit: 25,
    hasMore: false
  };
}

function configuration(enforcementEnabled: boolean) {
  return {
    enforcementEnabled
  };
}

async function run(
  options: {
    enabled?: boolean;
    enforcement?: boolean;
    authorized?: boolean;
    authStatus?: number;
    query?: any;
    failingStorage?: boolean;
    configThrows?: boolean;
  } = {}
) {
  const context: any = {};
  const calls = {
    authorize: 0,
    storage: 0
  };

  const handler = createGetKioskPendingReviewHandler({
    readConfiguration: (() => {
      if (options.configThrows) {
        throw new Error("SYNTHETIC_CONFIG_SECRET");
      }
      return configuration(
        options.enforcement ?? true
      );
    }) as any,
    authorizeActor: (async () => {
      calls.authorize++;

      if (options.authorized === false) {
        return {
          ok: false,
          status: options.authStatus ?? 403,
          body: { error: "Unauthorized" }
        };
      }

      return {
        ok: true,
        actorId: "synthetic-admin"
      };
    }) as any,
    readPending: (async (deps: any) => {
      calls.storage++;

      assert.equal(deps.enabled, true);
      assert.equal(deps.authorized, true);

      if (options.failingStorage) {
        throw new Error("SYNTHETIC_PRIVATE_GUEST_DATA");
      }

      return {
        ...pendingBatch(),
        limit: deps.limit
      };
    }) as any
  });

  await withFlag(options.enabled ?? true, async () => {
    await handler(context, {
      method: "GET",
      query: options.query ?? {}
    });
  });

  return { context, calls };
}

test("review feature is disabled without authorization or reads", async () => {
  const { context, calls } = await run({ enabled: false });
  assert.equal(context.res.status, 404);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.storage, 0);
});

test("disabled Entra enforcement cannot use legacy fallback", async () => {
  const { context, calls } = await run({
    enforcement: false
  });
  assert.equal(context.res.status, 403);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.storage, 0);
});

test("unauthorized administrator is denied without storage read", async () => {
  const { context, calls } = await run({
    authorized: false
  });
  assert.equal(context.res.status, 403);
  assert.equal(calls.storage, 0);
});

test("missing or invalid staff bearer authority is denied", async () => {
  const { context, calls } = await run({
    authorized: false,
    authStatus: 401
  });
  assert.equal(context.res.status, 401);
  assert.equal(calls.storage, 0);
});

test("authorized review returns a bounded read-only batch", async () => {
  const { context, calls } = await run();
  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.ok, true);
  assert.equal(context.res.body.limit, 25);
  assert.equal(calls.authorize, 1);
  assert.equal(calls.storage, 1);
  assert.equal(
    context.res.headers["cache-control"],
    "no-store"
  );
});

test("administrator can request a smaller limit", async () => {
  const { context } = await run({
    query: { limit: "5" }
  });
  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.limit, 5);
});

test("invalid limits never reach storage", async () => {
  for (const limit of ["0", "26", "-1", "1.5", "abc"]) {
    const { context, calls } = await run({
      query: { limit }
    });
    assert.equal(context.res.status, 400);
    assert.equal(calls.storage, 0);
  }
});

test("storage failure exposes no guest details", async () => {
  const { context } = await run({
    failingStorage: true
  });
  assert.equal(context.res.status, 503);
  assert.equal(
    JSON.stringify(context.res).includes(
      "SYNTHETIC_PRIVATE_GUEST_DATA"
    ),
    false
  );
});

test("invalid Entra configuration fails closed", async () => {
  const { context, calls } = await run({
    configThrows: true
  });
  assert.equal(context.res.status, 503);
  assert.equal(calls.authorize, 0);
  assert.equal(calls.storage, 0);
  assert.equal(
    JSON.stringify(context.res).includes(
      "SYNTHETIC_CONFIG_SECRET"
    ),
    false
  );
});