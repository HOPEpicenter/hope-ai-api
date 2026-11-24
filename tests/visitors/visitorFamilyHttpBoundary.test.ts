import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import {
  visitorSundayCheckIn
} from "../../src/functions/visitorSundayCheckIn";

const bridge = "synthetic-bridge-key-123456789012345678901234567890";
const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const date = "2026-11-24";
const now = DateTime.fromISO("2026-11-24T12:00:00", {
  zone: "America/New_York"
});

const family = {
  guardianName: "Sample Guardian",
  guardianDeclaration: true,
  children: [{ firstName: "Child", ageGroup: "6-11" }]
};

const request = {
  method: "POST",
  headers: { "x-hope-check-in-key": bridge },
  body: {
    submissionId,
    name: "Sample Guardian",
    contactMethod: "email",
    contact: "guardian@example.invalid",
    family
  }
};

async function run(
  req: any,
  options: {
    familyFlag?: boolean;
    generalFlag?: boolean;
    allow?: boolean;
    familyResult?: any;
  } = {}
) {
  const oldBridge = process.env.HOPE_VISITOR_CHECK_IN_BRIDGE_KEY;
  const oldGeneral = process.env.FEATURE_SUNDAY_VISITOR_CHECK_IN;
  const oldFamily = process.env.FEATURE_VISITOR_FAMILY_CHECK_IN;
  let reservations = 0;
  let familyCalls = 0;
  let adultCalls = 0;
  let lastServiceId = "";

  try {
    process.env.HOPE_VISITOR_CHECK_IN_BRIDGE_KEY = bridge;
    process.env.FEATURE_SUNDAY_VISITOR_CHECK_IN =
      options.generalFlag === false ? "false" : "true";
    process.env.FEATURE_VISITOR_FAMILY_CHECK_IN =
      options.familyFlag ? "true" : "false";

    const ctx: any = {};

    await visitorSundayCheckIn(ctx, req, {
      now: () => now,
      approvedEvents: async () => [],
      reserve: async () => {
        reservations++;
        return options.allow !== false;
      },
      record: async () => {
        adultCalls++;
        return {
          status: "recorded" as const,
          receipt: {
            submissionId,
            visitorId: "synthetic-adult",
            serviceId: `visit-${date}`,
            recordedAt: "2026-11-24T17:00:00.000Z"
          }
        };
      },
      recordFamily: async value => {
        familyCalls++;
        lastServiceId = value.serviceId;
        return options.familyResult ?? {
          status: "recorded" as const,
          adultVisitorId: "synthetic-adult",
          familyAttendanceId: "family-attendance-synthetic",
          replay: false
        };
      }
    });

    return {
      status: ctx.res.status as number,
      body: ctx.res.body as any,
      reservations,
      familyCalls,
      adultCalls,
      lastServiceId
    };
  } finally {
    function restore(name: string, value: string | undefined) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }

    restore("HOPE_VISITOR_CHECK_IN_BRIDGE_KEY", oldBridge);
    restore("FEATURE_SUNDAY_VISITOR_CHECK_IN", oldGeneral);
    restore("FEATURE_VISITOR_FAMILY_CHECK_IN", oldFamily);
  }
}

test("general check-in feature remains default-deny", async () => {
  const result = await run(request, {
    generalFlag: false,
    familyFlag: true
  });

  assert.equal(result.status, 404);
  assert.equal(result.familyCalls, 0);
  assert.equal(result.reservations, 0);
});

test("family registration remains separately disabled", async () => {
  const result = await run(request);

  assert.equal(result.status, 404);
  assert.equal(result.familyCalls, 0);
  assert.equal(result.reservations, 0);
});

test("missing bridge key cannot submit family registration", async () => {
  const result = await run({
    ...request,
    headers: {}
  }, { familyFlag: true });

  assert.equal(result.status, 401);
  assert.equal(result.familyCalls, 0);
  assert.equal(result.reservations, 0);
});

test("approved family submission uses server-selected service ID", async () => {
  const result = await run(request, { familyFlag: true });

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "recorded");
  assert.equal(result.familyCalls, 1);
  assert.equal(result.adultCalls, 0);
  assert.equal(result.lastServiceId, `visit-${date}`);
});

test("family attendance failure cannot return recorded", async () => {
  const result = await run(request, {
    familyFlag: true,
    familyResult: {
      status: "family_incomplete",
      reason: "storage_unavailable"
    }
  });

  assert.equal(result.status, 503);
  assert.notEqual(result.body.status, "recorded");
});

test("changed children under same submission cannot return recorded", async () => {
  const result = await run(request, {
    familyFlag: true,
    familyResult: {
      status: "family_incomplete",
      reason: "submission_conflict"
    }
  });

  assert.equal(result.status, 409);
  assert.notEqual(result.body.status, "recorded");
});

test("family validation fails before capacity reservation", async () => {
  const result = await run({
    ...request,
    body: {
      ...request.body,
      family: {
        ...family,
        guardianDeclaration: false
      }
    }
  }, { familyFlag: true });

  assert.equal(result.status, 400);
  assert.equal(result.reservations, 0);
  assert.equal(result.familyCalls, 0);
});

test("capacity limiter applies to family registration", async () => {
  const result = await run(request, {
    familyFlag: true,
    allow: false
  });

  assert.equal(result.status, 429);
  assert.equal(result.familyCalls, 0);
});

test("adult-only check-in retains its existing behavior", async () => {
  const { family: _family, ...adultBody } = request.body;

  const result = await run({
    ...request,
    body: adultBody
  });

  assert.equal(result.status, 200);
  assert.equal(result.adultCalls, 1);
  assert.equal(result.familyCalls, 0);
});

test("the visitor cannot inject a service ID", async () => {
  const result = await run({
    ...request,
    body: {
      ...request.body,
      serviceId: "forged-internal-event"
    }
  }, { familyFlag: true });

  assert.equal(result.status, 400);
  assert.equal(result.familyCalls, 0);
});