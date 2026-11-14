import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendKioskIntakeSubmissionV1
} from "../../src/repositories/kioskIntakeSubmissionsRepositoryV1";

const submissionId =
  "33333333-3333-4333-8333-333333333333";

const valid = {
  name: "Synthetic Visitor",
  email: "guest@example.test",
  phone: "",
  visitType: "first",
  interests: ["prayer"],
  invitedBy: "",
  contactConsent: true
};

class MemoryTable {
  rows = new Map<string, any>();

  async createEntity(entity: any) {
    const key = `${entity.partitionKey}/${entity.rowKey}`;

    if (this.rows.has(key)) {
      const error: any = new Error("Already exists");
      error.statusCode = 409;
      throw error;
    }

    this.rows.set(key, { ...entity });
  }

  async getEntity(partitionKey: string, rowKey: string) {
    const value = this.rows.get(`${partitionKey}/${rowKey}`);

    if (!value) throw new Error("MISSING_ROW");

    return { ...value };
  }
}

const now = () => "2026-11-22T15:00:00.000Z";

test("storage is disabled without explicit enablement", async () => {
  const table = new MemoryTable();
  const result = await appendKioskIntakeSubmissionV1(
    valid, submissionId, { table }
  );

  assert.equal(result.status, "disabled");
  assert.equal(table.rows.size, 0);
});

test("environment setting alone cannot enable storage", async () => {
  const table = new MemoryTable();
  const previous =
    process.env.HOPE_KIOSK_INTAKE_WRITE_ENABLED;

  try {
    process.env.HOPE_KIOSK_INTAKE_WRITE_ENABLED = "true";

    const result = await appendKioskIntakeSubmissionV1(
      valid, submissionId, { table, now }
    );

    assert.equal(result.status, "disabled");
    assert.equal(table.rows.size, 0);

    const explicitlyDisabled =
      await appendKioskIntakeSubmissionV1(
        valid, submissionId,
        { table, enabled: false, now }
      );

    assert.equal(explicitlyDisabled.status, "disabled");
    assert.equal(table.rows.size, 0);
  } finally {
    if (previous === undefined) {
      delete process.env.HOPE_KIOSK_INTAKE_WRITE_ENABLED;
    } else {
      process.env.HOPE_KIOSK_INTAKE_WRITE_ENABLED = previous;
    }
  }
});
test("valid enabled submission persists consent", async () => {
  const table = new MemoryTable();
  const result = await appendKioskIntakeSubmissionV1(
    valid, submissionId, { table, enabled: true, now }
  );

  assert.deepEqual(result, {
    accepted: true,
    status: "recorded"
  });

  const row = [...table.rows.values()][0];

  assert.equal(row.contactConsent, true);
  assert.equal(row.reviewStatus, "pending");
  assert.equal(row.source, "hope_ipad_kiosk_v1");
  assert.equal(row.receivedAt, now());
});

test("consent refusal is preserved", async () => {
  const table = new MemoryTable();

  await appendKioskIntakeSubmissionV1(
    { ...valid, contactConsent: false },
    submissionId,
    { table, enabled: true, now }
  );

  assert.equal(
    [...table.rows.values()][0].contactConsent,
    false
  );
});

test("same submission ID and payload are retry safe", async () => {
  const table = new MemoryTable();
  const deps = { table, enabled: true, now };

  await appendKioskIntakeSubmissionV1(valid, submissionId, deps);

  const replay = await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  assert.equal(replay.status, "already_recorded");
  assert.equal(table.rows.size, 1);
});

test("same ID with changed payload is rejected", async () => {
  const table = new MemoryTable();
  const deps = { table, enabled: true, now };

  await appendKioskIntakeSubmissionV1(valid, submissionId, deps);

  const result = await appendKioskIntakeSubmissionV1(
    { ...valid, name: "Different Synthetic Visitor" },
    submissionId,
    deps
  );

  assert.equal(result.status, "idempotency_conflict");
  assert.equal(table.rows.size, 1);
});

test("malformed submission ID cannot write", async () => {
  const table = new MemoryTable();

  const result = await appendKioskIntakeSubmissionV1(
    valid, "invalid",
    { table, enabled: true, now }
  );

  assert.equal(result.status, "invalid");
  assert.equal(table.rows.size, 0);
});

test("caller cannot supply trusted visitor identity", async () => {
  const table = new MemoryTable();

  const result = await appendKioskIntakeSubmissionV1(
    { ...valid, visitorId: "trusted-id" },
    submissionId,
    { table, enabled: true, now }
  );

  assert.equal(result.status, "invalid");
  assert.equal(table.rows.size, 0);
});

test("storage failures must not report success", async () => {
  const table = {
    async createEntity() {
      throw new Error("STORAGE_UNAVAILABLE");
    },
    async getEntity() {
      throw new Error("UNEXPECTED_READ");
    }
  };

  await assert.rejects(
    () => appendKioskIntakeSubmissionV1(
      valid, submissionId, { table, enabled: true, now }
    ),
    /STORAGE_UNAVAILABLE/
  );
});

test("ambiguous duplicate cannot report success", async () => {
  const table = {
    async createEntity() {
      const error: any = new Error("Conflict");
      error.statusCode = 409;
      throw error;
    },
    async getEntity() {
      throw new Error("UNREADABLE_EXISTING_ROW");
    }
  };

  await assert.rejects(
    () => appendKioskIntakeSubmissionV1(
      valid, submissionId, { table, enabled: true, now }
    ),
    /UNREADABLE_EXISTING_ROW/
  );
});

test("a stored receipt does not expose visitor PII", async () => {
  const table = new MemoryTable();

  const receipt = await appendKioskIntakeSubmissionV1(
    valid, submissionId,
    { table, enabled: true, now }
  );

  const serialized = JSON.stringify(receipt);

  assert.equal(serialized.includes(valid.name), false);
  assert.equal(serialized.includes(valid.email), false);
});