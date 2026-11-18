import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createKioskVisitorReconciliationHandler
} from "../../src/functions/postKioskVisitorReconciliation";

const ID = "12345678-1234-4234-8234-123456789abc";

const original =
  process.env.HOPE_KIOSK_RECONCILIATION_ENABLED;

type Options = {
  enabled?: boolean;
  enforcement?: boolean;
  authorized?: boolean;
  body?: unknown;
  importStatus?: "imported" | "already_claimed" |
    "manual_recovery_required";
};

async function invoke(options: Options = {}) {
  let authorizationCalls = 0;
  let importCalls = 0;
  let receivedInput: unknown = null;

  process.env.HOPE_KIOSK_RECONCILIATION_ENABLED =
    options.enabled === false ? "false" : "true";

  const context: any = {};

  const handler = createKioskVisitorReconciliationHandler({
    readConfiguration: (() => ({
      enforcementEnabled: options.enforcement !== false
    })) as any,

    authorize: (async () => {
      authorizationCalls++;
      return options.authorized === false
        ? { ok: false, status: 403 }
        : { ok: true, actorId: "synthetic-admin" };
    }) as any,

    reconcile: (async (input: unknown) => {
      importCalls++;
      receivedInput = input;

      switch (options.importStatus) {
        case "already_claimed":
          return { status: "already_claimed" };

        case "manual_recovery_required":
          return { status: "manual_recovery_required" };

        default:
          return {
            status: "imported",
            visitorId: "synthetic-visitor-id",
            eligibleForStaffFollowup: true,
            requiresVisitHistoryReview: false
          };
      }
    }) as any
  });

  await handler(context, {
    body: options.body === undefined
      ? { submissionId: ID }
      : options.body
  });

  return {
    response: context.res,
    authorizationCalls,
    importCalls,
    receivedInput
  };
}

test.after(() => {
  if (original === undefined) {
    delete process.env.HOPE_KIOSK_RECONCILIATION_ENABLED;
  } else {
    process.env.HOPE_KIOSK_RECONCILIATION_ENABLED = original;
  }
});

test("disabled endpoint denies before authorization", async () => {
  const result = await invoke({ enabled: false });

  assert.equal(result.response.status, 404);
  assert.equal(result.authorizationCalls, 0);
  assert.equal(result.importCalls, 0);
});

test("legacy authorization fallback is prohibited", async () => {
  const result = await invoke({ enforcement: false });

  assert.equal(result.response.status, 403);
  assert.equal(result.authorizationCalls, 0);
  assert.equal(result.importCalls, 0);
});

test("unauthorized administrator cannot import", async () => {
  const result = await invoke({ authorized: false });

  assert.equal(result.response.status, 403);
  assert.equal(result.importCalls, 0);
});

test("malformed request is rejected", async () => {
  const result = await invoke({
    body: { submissionId: ID, administratorAuthorized: true }
  });

  assert.equal(result.response.status, 400);
  assert.equal(result.importCalls, 0);
});

test("missing submission ID is rejected", async () => {
  const result = await invoke({ body: {} });

  assert.equal(result.response.status, 400);
  assert.equal(result.importCalls, 0);
});

test("authorized request supplies trusted flags internally", async () => {
  const result = await invoke();

  assert.equal(result.response.status, 200);
  assert.equal(result.importCalls, 1);
  assert.deepEqual(result.receivedInput, {
    submissionId: ID,
    enabled: true,
    administratorAuthorized: true
  });
});

test("already claimed submission cannot import again", async () => {
  const result = await invoke({
    importStatus: "already_claimed"
  });

  assert.equal(result.response.status, 409);
});

test("incomplete import requires manual recovery", async () => {
  const result = await invoke({
    importStatus: "manual_recovery_required"
  });

  assert.equal(result.response.status, 503);
  assert.equal(
    result.response.body.error,
    "MANUAL_REVIEW_REQUIRED"
  );
});
