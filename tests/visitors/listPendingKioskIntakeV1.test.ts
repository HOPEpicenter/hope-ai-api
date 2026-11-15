import assert from "node:assert/strict";
import { test } from "node:test";
import {
  listPendingKioskIntakeV1
} from "../../src/repositories/listPendingKioskIntakeV1";

const EVENT = "friends-family-2026-11-22";

function row(index: number) {
  const id =
    `aaaaaaaa-aaaa-4aaa-8aaa-${index.toString(16)
      .padStart(12, "0")}`;

  return {
    partitionKey: EVENT,
    rowKey: id,
    source: "hope_ipad_kiosk_v1",
    reviewStatus: "pending",
    name: `Synthetic Guest ${index}`,
    email: `guest${index}@example.invalid`,
    phone: "",
    visitType: "first_time",
    interestsJson: '["connections"]',
    invitedBy: "",
    contactConsent: false,
    receivedAt: "2026-11-22T15:00:00.000Z",
    payloadHash: "PRIVATE_HASH_NOT_FOR_REVIEW",
    unexpectedSensitiveField: "NEVER_RETURN_THIS"
  };
}

function store(rows: any[]) {
  let reads = 0;
  let yielded = 0;
  let filter = "";

  return {
    get reads() { return reads; },
    get yielded() { return yielded; },
    get filter() { return filter; },

    async *listEntities(options: any) {
      reads++;
      filter = options.queryOptions.filter;

      for (const item of rows) {
        yielded++;
        yield item;
      }
    }
  };
}

test("disabled review cannot read visitor records", async () => {
  const data = store([row(1)]);

  await assert.rejects(
    listPendingKioskIntakeV1({
      store: data,
      authorized: true
    }),
    /KIOSK_REVIEW_NOT_AUTHORIZED/
  );

  assert.equal(data.reads, 0);
});

test("missing trusted authorization cannot read", async () => {
  const data = store([row(1)]);

  await assert.rejects(
    listPendingKioskIntakeV1({
      store: data,
      enabled: true
    }),
    /KIOSK_REVIEW_NOT_AUTHORIZED/
  );

  assert.equal(data.reads, 0);
});

test("authorized read returns pending projected fields", async () => {
  const data = store([row(1)]);

  const result = await listPendingKioskIntakeV1({
    store: data,
    enabled: true,
    authorized: true
  });

  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].name, "Synthetic Guest 1");
  assert.equal(result.items[0].contactConsent, false);
  assert.equal(result.items[0].reviewStatus, "pending");

  const serialized = JSON.stringify(result);

  assert.equal(serialized.includes("PRIVATE_HASH"), false);
  assert.equal(
    serialized.includes("NEVER_RETURN_THIS"),
    false
  );

  assert.equal(
    data.filter,
    `PartitionKey eq '${EVENT}' and ` +
    `reviewStatus eq 'pending'`
  );
});

test("review returns a maximum of 25 records", async () => {
  const data = store(
    Array.from({ length: 40 }, (_, i) => row(i + 1))
  );

  const result = await listPendingKioskIntakeV1({
    store: data,
    enabled: true,
    authorized: true
  });

  assert.equal(result.items.length, 25);
  assert.equal(result.hasMore, true);
  assert.equal(data.yielded, 26);
});

test("smaller authorized limit is honored", async () => {
  const data = store([row(1), row(2), row(3)]);

  const result = await listPendingKioskIntakeV1({
    store: data,
    enabled: true,
    authorized: true,
    limit: 2
  });

  assert.equal(result.items.length, 2);
  assert.equal(result.hasMore, true);
});

test("empty review queue returns no guest records", async () => {
  const data = store([]);

  const result = await listPendingKioskIntakeV1({
    store: data,
    enabled: true,
    authorized: true
  });

  assert.deepEqual(result.items, []);
  assert.equal(result.hasMore, false);
});

test("invalid limits fail before storage reads", async () => {
  const data = store([row(1)]);

  for (const limit of [0, -1, 26, 1.5]) {
    await assert.rejects(
      listPendingKioskIntakeV1({
        store: data,
        enabled: true,
        authorized: true,
        limit
      }),
      /INVALID_KIOSK_REVIEW_LIMIT/
    );
  }

  assert.equal(data.reads, 0);
});

test("wrong event or forged source fails closed", async () => {
  for (const bad of [
    { ...row(1), partitionKey: "other-event" },
    { ...row(1), source: "untrusted_source" },
    { ...row(1), reviewStatus: "reviewed" }
  ]) {
    await assert.rejects(
      listPendingKioskIntakeV1({
        store: store([bad]),
        enabled: true,
        authorized: true
      }),
      /INVALID_KIOSK_REVIEW_RECORD/
    );
  }
});

test("malformed stored interests fail closed", async () => {
  await assert.rejects(
    listPendingKioskIntakeV1({
      store: store([
        { ...row(1), interestsJson: "{broken" }
      ]),
      enabled: true,
      authorized: true
    }),
    /INVALID_KIOSK_REVIEW_RECORD/
  );
});

test("storage failures never return successful review", async () => {
  const failingStore = {
    async *listEntities() {
      throw new Error("SYNTHETIC_STORAGE_FAILURE");
      yield row(1);
    }
  };

  await assert.rejects(
    listPendingKioskIntakeV1({
      store: failingStore,
      enabled: true,
      authorized: true
    }),
    /SYNTHETIC_STORAGE_FAILURE/
  );
});