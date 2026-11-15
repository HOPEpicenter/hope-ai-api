import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appendKioskIntakeSubmissionV1,
  inspectExistingKioskIntakeSubmissionV1
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

test("retry after review preserves reviewed status", async () => {
  const table = new MemoryTable();
  const deps = { table, enabled: true, now };

  await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  const key =
    `friends-family-2026-11-22/${submissionId}`;

  const stored = table.rows.get(key);

  assert.ok(stored);

  table.rows.set(key, {
    ...stored,
    reviewStatus: "reviewed"
  });

  const result = await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  assert.deepEqual(result, {
    accepted: true,
    status: "already_recorded"
  });

  assert.equal(table.rows.size, 1);
  assert.equal(
    table.rows.get(key).reviewStatus,
    "reviewed"
  );
});

test("reviewed record cannot be replaced by changed payload", async () => {
  const table = new MemoryTable();
  const deps = { table, enabled: true, now };

  await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  const key =
    `friends-family-2026-11-22/${submissionId}`;

  const stored = table.rows.get(key);

  table.rows.set(key, {
    ...stored,
    reviewStatus: "reviewed"
  });

  const result = await appendKioskIntakeSubmissionV1(
    {
      ...valid,
      contactConsent: false
    },
    submissionId,
    deps
  );

  assert.deepEqual(result, {
    accepted: false,
    status: "idempotency_conflict"
  });

  assert.equal(table.rows.size, 1);
  assert.equal(
    table.rows.get(key).contactConsent,
    true
  );
  assert.equal(
    table.rows.get(key).reviewStatus,
    "reviewed"
  );
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
function makeRetryPreflightStore() {
  const rows = new Map<string, any>();
  let writes = 0;
  let reads = 0;

  return {
    get writes() { return writes; },
    get reads() { return reads; },
    rows,

    async createEntity(entity: any) {
      writes++;

      const key = `${entity.partitionKey}/${entity.rowKey}`;

      if (rows.has(key)) {
        const error: any = new Error("synthetic conflict");
        error.statusCode = 409;
        throw error;
      }

      rows.set(key, { ...entity });
      return {};
    },

    async getEntity(partitionKey: string, rowKey: string) {
      reads++;

      const entity = rows.get(`${partitionKey}/${rowKey}`);

      if (!entity) {
        const error: any = new Error("synthetic not found");
        error.statusCode = 404;
        throw error;
      }

      return { ...entity };
    }
  };
}

test("retry preflight is disabled without reads or writes", async () => {
  const store = makeRetryPreflightStore();

  const status = await inspectExistingKioskIntakeSubmissionV1(
    valid, submissionId, { table: store }
  );

  assert.equal(status, "disabled");
  assert.equal(store.reads, 0);
  assert.equal(store.writes, 0);
});

test("retry preflight reports missing without writes", async () => {
  const store = makeRetryPreflightStore();

  const status = await inspectExistingKioskIntakeSubmissionV1(
    valid, submissionId, {
      table: store,
      enabled: true
    }
  );

  assert.equal(status, "missing");
  assert.equal(store.writes, 0);
  assert.equal(store.reads, 1);
});

test("retry preflight recognizes completed matching submission", async () => {
  const store = makeRetryPreflightStore();
  const deps = { table: store, enabled: true };

  const first = await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  assert.equal(first.status, "recorded");

  const originalWrites = store.writes;

  const status = await inspectExistingKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  assert.equal(status, "already_recorded");
  assert.equal(store.writes, originalWrites);
});

test("retry preflight rejects conflicting payload", async () => {
  const store = makeRetryPreflightStore();
  const deps = { table: store, enabled: true };

  await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  const changed = {
    ...valid,
    name: "Different Synthetic Guest"
  };

  const status = await inspectExistingKioskIntakeSubmissionV1(
    changed, submissionId, deps
  );

  assert.equal(status, "idempotency_conflict");
  assert.equal(store.writes, 1);
});

test("retry preflight rejects forged row provenance", async () => {
  const store = makeRetryPreflightStore();
  const deps = { table: store, enabled: true };

  await appendKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  const key = `friends-family-2026-11-22/${submissionId}`;
  const entity = store.rows.get(key);

  store.rows.set(key, {
    ...entity,
    source: "untrusted_synthetic_source"
  });

  const status = await inspectExistingKioskIntakeSubmissionV1(
    valid, submissionId, deps
  );

  assert.equal(status, "idempotency_conflict");
});

test("retry preflight never treats storage errors as missing", async () => {
  const store = {
    async createEntity() { return {}; },
    async getEntity() {
      throw new Error("SYNTHETIC_STORAGE_FAILURE");
    }
  };

  await assert.rejects(
    inspectExistingKioskIntakeSubmissionV1(
      valid, submissionId, {
        table: store,
        enabled: true
      }
    ),
    /SYNTHETIC_STORAGE_FAILURE/
  );
});

test("retry preflight validates before storage access", async () => {
  const store = makeRetryPreflightStore();

  const status = await inspectExistingKioskIntakeSubmissionV1(
    valid, "../invalid-id", {
      table: store,
      enabled: true
    }
  );

  assert.equal(status, "invalid");
  assert.equal(store.reads, 0);
  assert.equal(store.writes, 0);
});

test("retry preflight does not replace atomic insert", async () => {
  const store = makeRetryPreflightStore();
  const deps = { table: store, enabled: true };

  const observations = await Promise.all([
    inspectExistingKioskIntakeSubmissionV1(
      valid, submissionId, deps
    ),
    inspectExistingKioskIntakeSubmissionV1(
      valid, submissionId, deps
    )
  ]);

  assert.deepEqual(observations, ["missing", "missing"]);

  const writes = await Promise.all([
    appendKioskIntakeSubmissionV1(
      valid, submissionId, deps
    ),
    appendKioskIntakeSubmissionV1(
      valid, submissionId, deps
    )
  ]);

  assert.equal(
    writes.filter(result => result.status === "recorded").length,
    1
  );

  assert.equal(
    writes.filter(result =>
      result.status === "already_recorded"
    ).length,
    1
  );

  assert.equal(store.rows.size, 1);
});