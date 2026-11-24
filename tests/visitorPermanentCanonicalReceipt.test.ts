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

test("unmatched dual-contact identity remains protected pending writer integration", async () => {
  await withTable(async table => {
    const result = await recordVisitorArrival(
      command,
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
