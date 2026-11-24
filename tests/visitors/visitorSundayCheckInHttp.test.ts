import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { visitorSundayCheckIn } from "../../src/functions/visitorSundayCheckIn";

const bridgeKey = "check-in-bridge-test-key-with-more-than-32-characters";
const staffKey = "staff-api-test-key";
const request = {
  method: "POST",
  headers: { "x-hope-check-in-key": bridgeKey },
  body: {
    name: "Synthetic Guest", contactMethod: "email", contact: "guest@example.test",
    submissionId: "11111111-2222-4333-8444-555555555555"
  }
};

async function withSettings(run: () => Promise<void>) {
  const values = {
    FEATURE_SUNDAY_VISITOR_CHECK_IN: "true",
    HOPE_VISITOR_CHECK_IN_BRIDGE_KEY: bridgeKey,
    HOPE_API_KEY: staffKey
  };
  const before = Object.keys(values).map(key => [key, process.env[key]] as const);
  Object.assign(process.env, values);
  try { await run(); } finally {
    for (const [key, value] of before) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

test("the bridge derives Sunday from Eastern time and returns only a save status", async () => {
  await withSettings(async () => {
    const context: Parameters<typeof visitorSundayCheckIn>[0] = {};
    await visitorSundayCheckIn(context, request, {
      now: () => DateTime.fromISO("2026-11-30T02:30:00Z"),
      reserve: async () => true,
      record: async command => {
        assert.equal(command.serviceId, "sunday-2026-11-29");
        return { status: "recorded", receipt: {
          ...command, visitorId: "private-visitor-id", recordedAt: "2026-11-30T02:30:00Z"
        } };
      }
    });
    assert.deepEqual(context.res?.body, { status: "recorded" });
  });
});

test("disabled, unauthorized, invalid, closed and rate-limited requests never reach storage writes", async () => {
  await withSettings(async () => {
    const context: Parameters<typeof visitorSundayCheckIn>[0] = {};
    const deps = {
      now: () => DateTime.fromISO("2026-11-29T15:00:00Z"),
      reserve: async () => false,
      record: async () => { throw new Error("unexpected write"); }
    };
    delete process.env.FEATURE_SUNDAY_VISITOR_CHECK_IN;
    await visitorSundayCheckIn(context, request, deps);
    assert.equal(context.res?.status, 404);
    process.env.FEATURE_SUNDAY_VISITOR_CHECK_IN = "true";
    await visitorSundayCheckIn(context, { ...request, headers: { "x-api-key": staffKey } }, deps);
    assert.equal(context.res?.status, 401);
    await visitorSundayCheckIn(context, { ...request, body: { ...request.body, serviceId: "x" } }, deps);
    assert.equal(context.res?.status, 400);
    await visitorSundayCheckIn(context, request, { ...deps, now: () => DateTime.fromISO("2026-11-30T15:00:00Z") });
    assert.equal(context.res?.status, 429);
    await visitorSundayCheckIn(context, request, deps);
    assert.equal(context.res?.status, 429);
  });
});

test("the list requires the normal API key and an active Staff actor", async () => {
  await withSettings(async () => {
    const context: Parameters<typeof visitorSundayCheckIn>[0] = {};
    const get = { method: "GET", query: { date: "2026-11-29" } };
    const list = async (id: string) => {
      assert.equal(id, "sunday-2026-11-29");
      return { items: [], truncated: false };
    };
    await visitorSundayCheckIn(context, { ...get, headers: request.headers }, { list });
    assert.equal(context.res?.status, 401);
    const authorized = { ...get, headers: { "x-api-key": staffKey } };
    await visitorSundayCheckIn(context, authorized, {
      list,
      authorizeStaff: async () => ({ ok: false, status: 403, body: {} })
    });
    assert.equal(context.res?.status, 403);
    await visitorSundayCheckIn(context, authorized, {
      list,
      authorizeStaff: async () => ({ ok: true, actorId: "synthetic-staff" })
    });
    assert.equal(context.res?.status, 200);
  });
});

test("weekday visits are saved with a general visit identifier", async () => {
  await withSettings(async () => {
    const context: Parameters<typeof visitorSundayCheckIn>[0] = {};
    await visitorSundayCheckIn(context, request, {
      now: () => DateTime.fromISO("2026-11-30T15:00:00Z"),
      reserve: async () => true,
      record: async command => {
        assert.equal(command.serviceId, "visit-2026-11-30");
        return {
          status: "recorded",
          receipt: {
            ...command,
            visitorId: "synthetic-visitor",
            recordedAt: "2026-11-30T15:00:00Z"
          }
        };
      }
    });
    assert.equal(context.res?.status, 200);
    assert.deepEqual(context.res?.body, { status: "recorded" });
  });
});