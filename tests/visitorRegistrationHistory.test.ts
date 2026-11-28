import { test } from "node:test";
import { strict as assert } from "node:assert";
import type { TableClient } from "@azure/data-tables";

import {
  readCanonicalVisitorRegistrationHistory as read
} from "../src/services/visitors/readCanonicalVisitorRegistrationHistory";

const id = "synthetic-person-97";

const profile = {
  version: 1,
  name: "Synthetic Visitor",
  email: "visitor@example.invalid",
  phone: "2015550101",
  visitType: "first",
  churchHome: "looking",
  interests: ["church_events", "prayer"],
  invitedBy: "Synthetic Inviter",
  contactConsent: true
};

function receipt(index = 1) {
  return {
    partitionKey: "VISITOR_CHECK_IN",
    rowKey:
      "11111111-1111-4111-8111-" +
      String(index).padStart(12, "0"),
    visitorId: id,
    serviceId: "visit-2026-11-24",
    recordedAt: new Date(
      Date.parse("2026-11-24T19:00:00Z") +
      index * 1000
    ).toISOString(),
    registrationDetailsJson: JSON.stringify(profile)
  };
}

function fixture(
  rows: unknown[],
  fail = false
) {
  let calls = 0;

  const table = {
    async *listEntities(options: {
      queryOptions: { filter: string }
    }) {
      calls++;

      assert.equal(
        options.queryOptions.filter,
        "PartitionKey eq 'VISITOR_CHECK_IN' " +
        `and visitorId eq '${id}'`
      );

      if (fail) throw new Error("Synthetic storage failure");

      for (const row of rows) yield row;
    }
  } as unknown as Pick<TableClient, "listEntities">;

  return {
    table,
    calls: () => calls
  };
}

test("canonical history preserves the approved registration fields", async () => {
  const row = receipt();
  const f = fixture([row]);

  assert.deepEqual(
    await read(id, f.table),
    {
      status: "ready",
      registrationCount: 1,
      truncated: false,
      items: [{
        submissionId: row.rowKey,
        serviceId: row.serviceId,
        recordedAt: row.recordedAt,
        visitType: "first",
        churchHome: "looking",
        interests: ["church_events", "prayer"],
        invitedBy: "Synthetic Inviter",
        contactConsentAtRegistration: true
      }]
    }
  );

  assert.equal(f.calls(), 1);
});

test("returning visits retain their separate historical consent decisions", async () => {
  const first = receipt(1);

  const second = {
    ...receipt(2),
    registrationDetailsJson: JSON.stringify({
      ...profile,
      visitType: "returning",
      contactConsent: false
    })
  };

  const f = fixture([first, second]);
  const result = await read(id, f.table);

  assert.equal(result.status, "ready");

  if (result.status !== "ready") return;

  assert.equal(result.registrationCount, 2);
  assert.equal(result.items[0].visitType, "returning");
  assert.equal(result.items[0].contactConsentAtRegistration, false);
  assert.equal(result.items[1].contactConsentAtRegistration, true);
});

test("legacy receipts and missing optional registration details are handled", async () => {
  const legacy = {
    ...receipt(1),
    registrationDetailsJson: undefined
  };

  const modern = {
    ...receipt(2),
    registrationDetailsJson: JSON.stringify({
      ...profile,
      email: null,
      churchHome: null,
      invitedBy: null,
      interests: []
    })
  };

  const result = await read(
    id, fixture([legacy, modern]).table
  );

  assert.equal(result.status, "ready");

  if (result.status !== "ready") return;

  assert.equal(result.registrationCount, 1);
  assert.equal(result.items[0].churchHome, null);
  assert.equal(result.items[0].invitedBy, null);
  assert.deepEqual(result.items[0].interests, []);

  assert.deepEqual(
    await read(id, fixture([legacy]).table),
    {
      status: "ready",
      registrationCount: 0,
      truncated: false,
      items: []
    }
  );
});

test("registration history excludes historical contacts and raw storage properties", async () => {
  const row = {
    ...receipt(),
    admissionSecret: "synthetic-secret-not-for-staff"
  };

  const result = await read(
    id, fixture([row]).table
  );

  assert.equal(result.status, "ready");

  const output = JSON.stringify(result);

  for (const forbidden of [
    profile.name,
    profile.email,
    profile.phone,
    "registrationDetailsJson",
    "synthetic-secret-not-for-staff",
    "partitionKey"
  ]) {
    assert.equal(output.includes(forbidden), false);
  }
});

test("cross-person evidence and invalid identifiers fail closed", async () => {
  const f = fixture([{
    ...receipt(),
    visitorId: "different-synthetic-person"
  }]);

  assert.deepEqual(
    await read(id, f.table),
    { status: "unavailable" }
  );

  assert.deepEqual(
    await read("invalid'visitor", f.table),
    { status: "unavailable" }
  );

  assert.equal(f.calls(), 1);
});

test("malformed registration evidence never returns partial history", async () => {
  for (const invalid of [
    "{",
    JSON.stringify({
      ...profile,
      contactConsent: "yes"
    }),
    JSON.stringify({
      ...profile,
      interests: ["unrecognized"]
    }),
    JSON.stringify({
      ...profile,
      unknownField: "synthetic"
    })
  ]) {
    const f = fixture([
      receipt(1),
      {
        ...receipt(2),
        registrationDetailsJson: invalid
      }
    ]);

    assert.deepEqual(
      await read(id, f.table),
      { status: "unavailable" }
    );
  }
});

test("history is ordered and bounded with explicit truncation", async () => {
  const rows = Array.from(
    { length: 25 },
    (_, index) => receipt(index + 1)
  );

  const result = await read(id, fixture(rows).table);

  assert.equal(result.status, "ready");

  if (result.status !== "ready") return;

  assert.equal(result.registrationCount, 25);
  assert.equal(result.items.length, 20);
  assert.equal(result.truncated, true);

  assert.equal(
    result.items[0].submissionId,
    receipt(25).rowKey
  );

  assert.equal(
    result.items[19].submissionId,
    receipt(6).rowKey
  );
});

test("storage failure duplicate receipts and excessive history fail closed", async () => {
  assert.deepEqual(
    await read(id, fixture([], true).table),
    { status: "unavailable" }
  );

  assert.deepEqual(
    await read(id, fixture([
      receipt(), receipt()
    ]).table),
    { status: "unavailable" }
  );

  const excessive = Array.from(
    { length: 2001 },
    (_, index) => receipt(index + 1)
  );

  assert.deepEqual(
    await read(id, fixture(excessive).table),
    { status: "unavailable" }
  );
});
