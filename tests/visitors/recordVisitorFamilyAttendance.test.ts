import assert from "node:assert/strict";
import { test } from "node:test";
import type { TableClient } from "@azure/data-tables";
import {
  recordVisitorFamilyAttendance
} from "../../src/services/visitors/recordVisitorFamilyAttendance";
import {
  prepareVisitorFamilyAttendance
} from "../../src/services/visitors/prepareVisitorFamilyAttendance";
import type { CheckInResult } from "../../src/services/visitors/recordVisitorCheckIn";

const submissionId = "123e4567-e89b-42d3-a456-426614174000";
const serviceId = "visit-2026-11-30";
const visitorId = "synthetic-adult";

const receipt: CheckInResult = {
  status: "recorded",
  receipt: {
    submissionId, serviceId, visitorId,
    recordedAt: "2026-11-30T15:00:00.000Z"
  }
};

const family = {
  guardianName: "Sample Guardian",
  guardianDeclaration: true,
  children: [
    { firstName: "Child One", ageGroup: "3-5" },
    { firstName: "Child Two", ageGroup: "6-11" }
  ]
};

function prepared(children = family.children) {
  const result = prepareVisitorFamilyAttendance({
    submissionId,
    serviceId,
    adultVisitorId: visitorId,
    adultName: "Sample Guardian",
    family: { ...family, children },
    checkIn: receipt
  });

  assert.equal(result.status, "prepared");
  if (result.status !== "prepared") {
    throw new Error("Synthetic preparation failed");
  }
  return result.attendance;
}

function storage(hasAdult = true) {
  const rows = new Map<string, any>();
  let writes = 0;

  if (hasAdult) {
    rows.set(`VISITOR_CHECK_IN/${submissionId}`, {
      partitionKey: "VISITOR_CHECK_IN",
      rowKey: submissionId,
      visitorId,
      serviceId,
      recordedAt: "2026-11-30T15:00:00.000Z"
    });
  }

  const table = {
    async getEntity(partition: string, rowKey: string) {
      const existing = rows.get(`${partition}/${rowKey}`);
      if (!existing) throw { statusCode: 404 };
      return { ...existing };
    },

    async createEntity(row: any) {
      const key = `${row.partitionKey}/${row.rowKey}`;
      if (rows.has(key)) throw { statusCode: 409 };
      rows.set(key, { ...row });
      writes++;
      return {};
    }
  };

  return {
    rows,
    table: table as unknown as TableClient,
    writes: () => writes
  };
}

test("family saves against an actual adult receipt", async () => {
  const state = storage();
  const result = await recordVisitorFamilyAttendance(
    prepared(), { table: state.table }
  );

  assert.equal(result.status, "saved");
  assert.equal(state.writes(), 1);

  const stored = [...state.rows.values()].find(
    row => row.partitionKey === "VISITOR_FAMILY_ATTENDANCE"
  );

  assert.ok(stored);
  assert.equal(stored.adultVisitorId, visitorId);
  assert.equal(JSON.parse(stored.childrenJson).length, 2);
});

test("an exact retry returns the same family record", async () => {
  const state = storage();
  const attendance = prepared();

  const first = await recordVisitorFamilyAttendance(
    attendance, { table: state.table }
  );
  const second = await recordVisitorFamilyAttendance(
    attendance, { table: state.table }
  );

  assert.equal(first.status, "saved");
  assert.equal(second.status, "saved");
  if (first.status === "saved" && second.status === "saved") {
    assert.equal(first.familyAttendanceId, second.familyAttendanceId);
    assert.equal(second.replay, true);
  }
  assert.equal(state.writes(), 1);
});

test("changed children under one submission are rejected", async () => {
  const state = storage();

  await recordVisitorFamilyAttendance(
    prepared(), { table: state.table }
  );

  const changed = prepared([
    { firstName: "Different Child", ageGroup: "12-17" }
  ]);

  const result = await recordVisitorFamilyAttendance(
    changed, { table: state.table }
  );

  assert.deepEqual(result, { status: "submission_conflict" });
  assert.equal(state.writes(), 1);
});

test("missing adult receipt prevents family storage", async () => {
  const state = storage(false);

  const result = await recordVisitorFamilyAttendance(
    prepared(), { table: state.table }
  );

  assert.deepEqual(result, { status: "adult_check_in_missing" });
  assert.equal(state.writes(), 0);
});

test("mismatched adult receipt prevents family storage", async () => {
  const state = storage();
  const key = `VISITOR_CHECK_IN/${submissionId}`;

  state.rows.set(key, {
    ...state.rows.get(key),
    visitorId: "different-adult"
  });

  const result = await recordVisitorFamilyAttendance(
    prepared(), { table: state.table }
  );

  assert.deepEqual(result, { status: "adult_mismatch" });
  assert.equal(state.writes(), 0);
});

test("unapproved child fields cannot enter storage", async () => {
  const state = storage();
  const altered = {
    ...prepared(),
    children: [{
      firstName: "Child",
      ageGroup: "6-11" as const,
      phone: "5555550100"
    }]
  };

  const result = await recordVisitorFamilyAttendance(
    altered, { table: state.table }
  );

  assert.deepEqual(result, { status: "invalid" });
  assert.equal(state.writes(), 0);
});

test("a lost write acknowledgement recovers the saved row", async () => {
  const state = storage();
  const backing = state.table;

  const table = {
    getEntity: (p: string, r: string) =>
      backing.getEntity(p, r),
    createEntity: async (row: any) => {
      await backing.createEntity(row);
      throw new Error("Synthetic lost acknowledgement");
    }
  };

  const result = await recordVisitorFamilyAttendance(
    prepared(),
    { table: table as unknown as TableClient }
  );

  assert.equal(result.status, "saved");
  if (result.status === "saved") {
    assert.equal(result.replay, true);
  }
  assert.equal(state.writes(), 1);
});

test("storage errors cannot produce a success receipt", async () => {
  const state = storage();
  const backing = state.table;

  const table = {
    getEntity: (p: string, r: string) =>
      backing.getEntity(p, r),
    createEntity: async () => {
      throw new Error("Synthetic storage unavailable");
    }
  };

  await assert.rejects(
    recordVisitorFamilyAttendance(
      prepared(),
      { table: table as unknown as TableClient }
    ),
    /Synthetic storage unavailable/
  );
});