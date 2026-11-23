import assert from "node:assert/strict";
import { test } from "node:test";
import { recordReturningVisitorCheckIn } from "../../src/services/visitors/recordReturningVisitorCheckIn";

const submission = {
  name: "  Synthetic   Visitor ",
  email: " GUEST@EXAMPLE.TEST ",
  phone: "(555) 010-0000",
  submissionId: "11111111-2222-4333-8444-555555555555",
  serviceId: "sunday-test"
};
const legacy = {
  rowKey: "visitor-a",
  name: "Synthetic Visitor",
  email: "guest@example.test",
  phone: "555-010-0000"
};
const recordedAt = "2026-11-29T15:00:00.000Z";

function fixture(rows = [legacy], profile = legacy) {
  const visits: unknown[] = [];
  return {
    visits,
    dependencies: {
      async *readContacts() { yield* rows; },
      async readVisitor(visitorId: string) {
        assert.equal(visitorId, profile.rowKey);
        return { ...profile, visitorId, createdAt: recordedAt, updatedAt: recordedAt };
      },
      async record(command: { submissionId: string; visitorId: string; serviceId: string }) {
        visits.push(command);
        return { status: "recorded" as const, receipt: { ...command, recordedAt } };
      }
    }
  };
}

test("a unique legacy match uses its existing canonical visitor ID", async () => {
  const { visits, dependencies } = fixture();
  assert.equal((await recordReturningVisitorCheckIn(submission, dependencies)).status, "recorded");
  assert.deepEqual(visits, [{
    submissionId: submission.submissionId,
    serviceId: submission.serviceId,
    visitorId: legacy.rowKey
  }]);
});

test("shared, split, changed and partial matches do not record a visit", async () => {
  for (const { visits, dependencies } of [
    fixture([legacy, { ...legacy, rowKey: "visitor-b" }]),
    fixture([{ ...legacy, phone: "" }, { ...legacy, rowKey: "visitor-b", email: "" }]),
    fixture([legacy], { ...legacy, name: "Changed name" }),
    fixture([{ ...legacy, phone: "" }])
  ]) {
    assert.deepEqual(await recordReturningVisitorCheckIn(submission, dependencies), {
      status: "requires_staff_review"
    });
    assert.equal(visits.length, 0);
  }
});

test("unmatched, invalid and incomplete searches cannot write a visit", async () => {
  const empty = fixture([]);
  assert.deepEqual(await recordReturningVisitorCheckIn(submission, empty.dependencies), {
    status: "unmatched"
  });
  assert.deepEqual(await recordReturningVisitorCheckIn({
    ...submission, email: "invalid"
  }, empty.dependencies), { status: "invalid" });
  const large = fixture([
    legacy,
    ...Array.from({ length: 2_000 }, (_, index) => ({
      ...legacy, rowKey: `other-${index}`, email: "", phone: ""
    }))
  ]);
  assert.deepEqual(await recordReturningVisitorCheckIn(submission, large.dependencies), {
    status: "requires_staff_review"
  });
  assert.equal(empty.visits.length + large.visits.length, 0);
});
