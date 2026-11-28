import assert from "node:assert/strict";
import { test } from "node:test";
import {
  recordVisitorFamilyCheckIn
} from "../../src/services/visitors/recordVisitorFamilyCheckIn";
import type {
  CheckInResult
} from "../../src/services/visitors/recordVisitorCheckIn";
import type {
  PreparedFamilyAttendance
} from "../../src/services/visitors/prepareVisitorFamilyAttendance";

const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const serviceId = "visit-2026-11-30";
const visitorId = "synthetic-adult";

const input = {
  submissionId,
  serviceId,
  name: "Sample Guardian",
  email: "guardian@example.invalid",
  family: {
    guardianName: "Sample Guardian",
    guardianDeclaration: true,
    children: [{ firstName: "Child", ageGroup: "6-11" }]
  }
};

const adult: CheckInResult = {
  status: "recorded",
  receipt: {
    submissionId,
    serviceId,
    visitorId,
    recordedAt: "2026-11-30T15:00:00.000Z"
  }
};

function dependencies() {
  let arrivals = 0;
  let familyWrites = 0;
  let failFamily = false;
  let saved: PreparedFamilyAttendance | undefined;

  return {
    deps: {
      arrival: async () => {
        arrivals++;
        return adult;
      },
      saveFamily: async (attendance: PreparedFamilyAttendance) => {
        if (failFamily) {
          throw new Error("Synthetic storage outage");
        }

        if (saved) {
          if (JSON.stringify(saved) !== JSON.stringify(attendance)) {
            return { status: "submission_conflict" as const };
          }

          return {
            status: "saved" as const,
            familyAttendanceId: attendance.familyAttendanceId,
            replay: true
          };
        }

        saved = structuredClone(attendance);
        familyWrites++;

        return {
          status: "saved" as const,
          familyAttendanceId: attendance.familyAttendanceId,
          replay: false
        };
      }
    },
    setFamilyFailure: (value: boolean) => {
      failFamily = value;
    },
    arrivals: () => arrivals,
    familyWrites: () => familyWrites
  };
}

test("complete family check-in requires both records", async () => {
  const state = dependencies();

  const result = await recordVisitorFamilyCheckIn(
    input, state.deps
  );

  assert.equal(result.status, "recorded");
  assert.equal(state.arrivals(), 1);
  assert.equal(state.familyWrites(), 1);

  if (result.status === "recorded") {
    assert.equal(result.adultVisitorId, visitorId);
    assert.match(result.familyAttendanceId,
      /^family-attendance-[0-9a-f]{32}$/);
  }
});

test("invalid family data never records the adult", async () => {
  const state = dependencies();

  const result = await recordVisitorFamilyCheckIn({
    ...input,
    family: {
      ...input.family,
      guardianDeclaration: false
    }
  }, state.deps);

  assert.deepEqual(result, { status: "invalid" });
  assert.equal(state.arrivals(), 0);
  assert.equal(state.familyWrites(), 0);
});

test("guardian mismatch never records the adult", async () => {
  const state = dependencies();

  const result = await recordVisitorFamilyCheckIn({
    ...input,
    name: "Different Adult"
  }, state.deps);

  assert.deepEqual(result, { status: "invalid" });
  assert.equal(state.arrivals(), 0);
});

test("failed adult check-in never records family", async () => {
  let familyWrites = 0;

  const result = await recordVisitorFamilyCheckIn(input, {
    arrival: async () => ({ status: "requires_staff_review" }),
    saveFamily: async () => {
      familyWrites++;
      throw new Error("Must never be called");
    }
  });

  assert.deepEqual(result, { status: "requires_staff_review" });
  assert.equal(familyWrites, 0);
});

test("family storage failure cannot report complete check-in", async () => {
  const state = dependencies();
  state.setFamilyFailure(true);

  const result = await recordVisitorFamilyCheckIn(
    input, state.deps
  );

  assert.deepEqual(result, {
    status: "family_incomplete",
    reason: "storage_unavailable"
  });
  assert.equal(state.arrivals(), 1);
  assert.equal(state.familyWrites(), 0);
});

test("retry after family storage failure finishes registration", async () => {
  const state = dependencies();
  state.setFamilyFailure(true);

  const first = await recordVisitorFamilyCheckIn(
    input, state.deps
  );

  assert.equal(first.status, "family_incomplete");

  state.setFamilyFailure(false);

  const second = await recordVisitorFamilyCheckIn(
    input, state.deps
  );

  assert.equal(second.status, "recorded");
  assert.equal(state.familyWrites(), 1);
});

test("exact repeated submission does not duplicate family storage", async () => {
  const state = dependencies();

  const first = await recordVisitorFamilyCheckIn(
    input, state.deps
  );
  const second = await recordVisitorFamilyCheckIn(
    input, state.deps
  );

  assert.equal(first.status, "recorded");
  assert.equal(second.status, "recorded");

  if (second.status === "recorded") {
    assert.equal(second.replay, true);
  }

  assert.equal(state.familyWrites(), 1);
});

test("changed children on retry cannot report complete check-in", async () => {
  const state = dependencies();

  const first = await recordVisitorFamilyCheckIn(
    input, state.deps
  );
  assert.equal(first.status, "recorded");

  const altered = {
    ...input,
    family: {
      ...input.family,
      children: [{
        firstName: "Different Child",
        ageGroup: "12-17"
      }]
    }
  };

  const second = await recordVisitorFamilyCheckIn(
    altered, state.deps
  );

  assert.deepEqual(second, {
    status: "family_incomplete",
    reason: "submission_conflict"
  });
  assert.equal(state.familyWrites(), 1);
});