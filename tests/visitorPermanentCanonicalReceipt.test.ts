import {
  createVisitorFromCheckIn,
  getVisitorById
} from "../src/functions/_shared/visitorsRepository";

import {
  resolveVisitorCheckInIdentity
} from "../src/services/visitors/recordReturningVisitorCheckIn";

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  recordVisitorArrival
} from "../src/services/visitors/recordVisitorArrival";

import {
  recordVisitorCheckIn
} from "../src/services/visitors/recordVisitorCheckIn";

import {
  recordVisitorFamilyCheckIn
} from "../src/services/visitors/recordVisitorFamilyCheckIn";

import type {
  PublicVisitProfile
} from "../src/services/visitors/preparePermanentPublicVisitRegistration";

type ArrivalDeps = NonNullable<
  Parameters<typeof recordVisitorArrival>[1]
>;

type CheckInDeps = NonNullable<
  Parameters<typeof recordVisitorCheckIn>[1]
>;

type IdentityResolver = NonNullable<
  ArrivalDeps["resolveIdentity"]
>;

type VisitorReader = NonNullable<
  CheckInDeps["readVisitor"]
>;

const visitorId = "synthetic-existing-visitor";

const profile: PublicVisitProfile = {
  visitType: "returning",
  churchHome: "looking",
  interests: ["church_events", "prayer"],
  invitedBy: "Synthetic Inviter",
  contactConsent: false
};

const command = {
  submissionId: "11111111-1111-4111-8111-111111111111",
  serviceId: "visit-2026-11-24",
  name: "Synthetic Visitor",
  email: "guest@example.invalid",
  phone: "12015550123",
  profile
};

async function withTable(
  run: (table: TableClient) => Promise<void>
): Promise<void> {
  assert.equal(
    process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE,
    "true"
  );

  const tableName =
    "HopeVisitor67C" +
    randomUUID().replace(/-/g, "");

  const table = TableClient.fromConnectionString(
    "UseDevelopmentStorage=true",
    tableName
  );

  const endpoint = new URL(table.url);

  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, "10002");
  assert.equal(
    endpoint.pathname.replace(/\/$/, ""),
    "/devstoreaccount1"
  );

  await table.createTable();

  try {
    await run(table);
  } finally {
    await table.deleteTable();
  }
}

const readVisitor: VisitorReader = async id =>
  ({ visitorId: id }) as Awaited<
    ReturnType<VisitorReader>
  >;

function arrivalDependencies(
  table: TableClient
): ArrivalDeps {
  return {
    table,
    resolveIdentity: async () =>
      ({ status: "matched", visitorId }) as Awaited<
        ReturnType<IdentityResolver>
      >,
    record: async (input, deps) =>
      recordVisitorCheckIn(input, {
        ...deps,
        table,
        readVisitor
      }),
    createProfile: async () => {
      throw new Error(
        "Existing visitor must not create another profile"
      );
    }
  };
}

async function readDetails(
  table: TableClient
): Promise<string> {
  const row = await table.getEntity<{
    registrationDetailsJson?: string;
  }>(
    "VISITOR_CHECK_IN",
    command.submissionId
  );

  assert.equal(
    typeof row.registrationDetailsJson,
    "string"
  );

  return row.registrationDetailsJson!;
}

test("canonical visit durably preserves both submitted contacts and complete profile", async () => {
  await withTable(async table => {
    const result = await recordVisitorArrival(
      command,
      arrivalDependencies(table)
    );

    assert.equal(result.status, "recorded");

    if (result.status !== "recorded") {
      throw new Error("Expected durable receipt");
    }

    assert.equal(result.receipt.visitorId, visitorId);

    // Private details must not leak into the receipt.
    assert.deepEqual(
      Object.keys(result.receipt).sort(),
      [
        "recordedAt",
        "serviceId",
        "submissionId",
        "visitorId"
      ]
    );

    assert.deepEqual(
      JSON.parse(await readDetails(table)),
      {
        version: 1,
        name: command.name,
        email: command.email,
        phone: command.phone,
        ...profile
      }
    );
  });
});

test("identical retry preserves receipt and changed consent conflicts", async () => {
  await withTable(async table => {
    const deps = arrivalDependencies(table);

    const first = await recordVisitorArrival(
      command, deps
    );

    assert.equal(first.status, "recorded");

    const second = await recordVisitorArrival(
      command, deps
    );

    assert.deepEqual(second, first);

    const changed = await recordVisitorArrival({
      ...command,
      profile: {
        ...profile,
        contactConsent: true
      }
    }, deps);

    assert.deepEqual(changed, {
      status: "submission_conflict"
    });

    assert.equal(
      JSON.parse(
        await readDetails(table)
      ).contactConsent,
      false
    );
  });
});

test("canonical receipt rejects omitted or changed registration details", async () => {
  await withTable(async table => {
    const saved = await recordVisitorArrival(
      command,
      arrivalDependencies(table)
    );

    assert.equal(saved.status, "recorded");

    const identity = {
      submissionId: command.submissionId,
      serviceId: command.serviceId,
      visitorId
    };

    assert.deepEqual(
      await recordVisitorCheckIn(
        identity, { table, readVisitor }
      ),
      { status: "submission_conflict" }
    );

    assert.deepEqual(
      await recordVisitorCheckIn({
        ...identity,
        registrationDetailsJson: "{}"
      }, { table, readVisitor }),
      { status: "submission_conflict" }
    );

    assert.equal(
      JSON.parse(
        await readDetails(table)
      ).contactConsent,
      false
    );
  });
});

test("legacy check-in callers retain their original receipt contract", async () => {
  await withTable(async table => {
    const legacy = {
      submissionId: command.submissionId,
      serviceId: command.serviceId,
      name: command.name,
      email: command.email
    };

    const deps = arrivalDependencies(table);

    const first = await recordVisitorArrival(
      legacy, deps
    );

    assert.equal(first.status, "recorded");

    assert.deepEqual(
      await recordVisitorArrival(legacy, deps),
      first
    );

    const row = await table.getEntity<{
      registrationDetailsJson?: string;
    }>(
      "VISITOR_CHECK_IN",
      legacy.submissionId
    );

    assert.equal(
      row.registrationDetailsJson,
      undefined
    );
  });
});

test("family arrival forwards complete profile without confirming incomplete attendance", async () => {
  let forwarded = false;

  const result = await recordVisitorFamilyCheckIn({
    ...command,
    family: {
      guardianName: command.name,
      guardianDeclaration: true,
      children: [
        {
          firstName: "Synthetic Child",
          ageGroup: "6-11"
        }
      ]
    }
  }, {
    async arrival(input) {
      assert.deepEqual(input.profile, profile);
      assert.equal(input.email, command.email);
      assert.equal(input.phone, command.phone);

      forwarded = true;

      return {
        status: "recorded",
        receipt: {
          submissionId: command.submissionId,
          serviceId: command.serviceId,
          visitorId,
          recordedAt: "2026-11-24T19:00:00.000Z"
        }
      };
    },
    async saveFamily() {
      throw new Error("Synthetic family storage failure");
    }
  });

  assert.equal(forwarded, true);

  assert.deepEqual(result, {
    status: "family_incomplete",
    reason: "storage_unavailable"
  });
});

test("legacy unmatched dual-contact identity remains protected", async () => {
  await withTable(async table => {
    const result = await recordVisitorArrival(
      {
        submissionId: command.submissionId,
        serviceId: command.serviceId,
        name: command.name,
        email: command.email,
        phone: command.phone
      },
      {
        ...arrivalDependencies(table),
        resolveIdentity: async () =>
          ({ status: "unmatched" }) as Awaited<
            ReturnType<IdentityResolver>
          >,
        record: async () => {
          throw new Error(
            "Unresolved identity must not write attendance"
          );
        }
      }
    );

    assert.deepEqual(result, {
      status: "requires_staff_review"
    });

    const rows: unknown[] = [];

    for await (const row of table.listEntities()) {
      rows.push(row);
    }

    assert.equal(rows.length, 0);
  });
});

type LocalContact = {
  rowKey: string;
  name?: string;
  email?: string;
  emailLower?: string;
  phone?: string;
  phoneCanonical?: string;
};

function actualLocalArrival(
  table: TableClient
): ArrivalDeps {
  const readLocalVisitor: VisitorReader =
    async id => getVisitorById(id, {
      getTableClient: () => table,
      ensureTableExists: async () => {}
    });

  return {
    table,
    resolveIdentity: input =>
      resolveVisitorCheckInIdentity(input, {
        readContacts: () =>
          table.listEntities<LocalContact>({
            queryOptions: {
              filter: "PartitionKey eq 'VISITOR'"
            }
          }),
        readVisitor: readLocalVisitor
      }),
    createProfile: createVisitorFromCheckIn,
    record: (input, deps) =>
      recordVisitorCheckIn(input, {
        ...deps,
        table,
        readVisitor: readLocalVisitor
      })
  };
}

const newDualContact = {
  visitorId: "synthetic-new-dual-contact",
  submissionId: command.submissionId,
  name: command.name,
  contact: {
    kind: "EMAIL" as const,
    value: command.email
  },
  secondaryPhone: command.phone,
  now: "2026-11-24T19:00:00.000Z"
};

test("new dual-contact public visitor is created once and recognized on a later visit", async () => {
  await withTable(async table => {
    const deps = actualLocalArrival(table);

    const first = await recordVisitorArrival(
      command, deps
    );

    assert.equal(first.status, "recorded");

    if (first.status !== "recorded") {
      throw new Error("Expected saved visit");
    }

    const id = first.receipt.visitorId;

    const person = await table.getEntity<{
      email: string;
      phone: string;
    }>("VISITOR", id);

    assert.equal(person.email, command.email);
    assert.equal(person.phone, command.phone);

    for (const [partition, value] of [
      ["EMAIL", command.email],
      ["PHONE", command.phone]
    ]) {
      const index = await table.getEntity<{
        visitorId: string;
      }>(
        partition,
        encodeURIComponent(value)
      );

      assert.equal(index.visitorId, id);
    }

    assert.deepEqual(
      await recordVisitorArrival(command, deps),
      first
    );

    const returning = await recordVisitorArrival({
      ...command,
      submissionId: "22222222-2222-4222-8222-222222222222",
      serviceId: "visit-2026-11-25"
    }, deps);

    assert.equal(returning.status, "recorded");

    if (returning.status === "recorded") {
      assert.equal(returning.receipt.visitorId, id);
    }

    let profiles = 0;

    for await (const _ of table.listEntities({
      queryOptions: {
        filter: "PartitionKey eq 'VISITOR'"
      }
    })) {
      profiles++;
    }

    assert.equal(profiles, 1);
  });
});

test("a conflicting contact index cannot be transferred or create a new profile", async () => {
  await withTable(async table => {
    await table.createEntity({
      partitionKey: "PHONE",
      rowKey: encodeURIComponent(command.phone),
      visitorId: "synthetic-other-owner",
      createdAt: newDualContact.now
    });

    assert.equal(
      await createVisitorFromCheckIn(
        table, newDualContact
      ),
      false
    );

    const index = await table.getEntity<{
      visitorId: string;
    }>("PHONE", encodeURIComponent(command.phone));

    assert.equal(
      index.visitorId,
      "synthetic-other-owner"
    );

    const rows: unknown[] = [];

    for await (const row of table.listEntities()) {
      rows.push(row);
    }

    // Known conflict was found before any new reservation.
    assert.equal(rows.length, 1);
  });
});

test("an interrupted first-index reservation can resume under the same claim", async () => {
  await withTable(async table => {
    await table.createEntity({
      partitionKey: "EMAIL",
      rowKey: encodeURIComponent(command.email),
      visitorId: newDualContact.visitorId,
      createdAt: newDualContact.now
    });

    assert.equal(
      await createVisitorFromCheckIn(
        table, newDualContact
      ),
      true
    );

    assert.equal(
      await createVisitorFromCheckIn(
        table, newDualContact
      ),
      true
    );

    const rows: unknown[] = [];

    for await (const row of table.listEntities()) {
      rows.push(row);
    }

    assert.equal(rows.length, 3);

    // A different submission cannot reuse the marker.
    assert.equal(
      await createVisitorFromCheckIn(table, {
        ...newDualContact,
        submissionId: "33333333-3333-4333-8333-333333333333"
      }),
      false
    );
  });
});

test("concurrent claims for the same contacts cannot publish two visitor profiles", async () => {
  await withTable(async table => {
    const first = newDualContact;

    const second = {
      ...first,
      visitorId: "synthetic-competing-visitor",
      submissionId: "44444444-4444-4444-8444-444444444444"
    };

    const results = await Promise.all([
      createVisitorFromCheckIn(table, first),
      createVisitorFromCheckIn(table, second)
    ]);

    assert.equal(
      results.filter(value => value === true).length,
      1
    );

    const winner = results[0] ? first : second;

    const email = await table.getEntity<{
      visitorId: string;
    }>("EMAIL", encodeURIComponent(command.email));

    const phone = await table.getEntity<{
      visitorId: string;
    }>("PHONE", encodeURIComponent(command.phone));

    assert.equal(email.visitorId, winner.visitorId);
    assert.equal(phone.visitorId, winner.visitorId);

    let profiles = 0;

    for await (const _ of table.listEntities({
      queryOptions: {
        filter: "PartitionKey eq 'VISITOR'"
      }
    })) {
      profiles++;
    }

    assert.equal(profiles, 1);
  });
});
