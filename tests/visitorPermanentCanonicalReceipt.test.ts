import {
  enrollRecordedPublicVisitor
} from "../src/services/followups/enrollRecordedPublicVisitor";

import {
  SixWeekFollowupEventsRepository
} from "../src/repositories/sixWeekFollowupEventsRepository";

import {
  projectSixWeekVisitorFollowup
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

import {
  submitPermanentPublicVisitRegistration as submitPublic,
  type PermanentPublicRegistrationDependencies
} from "../src/services/visitors/submitPermanentPublicVisitRegistration";

import {
  issuePermanentPublicVisitSession
} from "../src/services/visitors/permanentPublicVisitSession";

import {
  createPermanentVisitorQrReservationStore
} from "../src/repositories/permanentVisitorQrReservationStore";

import type {
  PermanentPublicVisitContext
} from "../src/services/visitors/resolvePermanentPublicVisitEvent";

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

const publicSigningSecret =
  "synthetic-public-pipeline-signing-secret";

const publicClaimSecret =
  "synthetic-public-pipeline-independent-claim-secret";

const publicContext: PermanentPublicVisitContext = {
  enabled: true,
  nowMs: Date.parse("2026-11-24T19:00:00Z"),
  approvedEvents: []
};

const publicBody = {
  name: command.name,
  email: command.email,
  phone: command.phone,
  visitType: "first",
  churchHome: "looking",
  interests: ["prayer", "church_events"],
  invitedBy: "Synthetic Inviter",
  contactConsent: false
};

function publicSession(
  context = publicContext
): string {
  const token = issuePermanentPublicVisitSession(
    publicSigningSecret,
    context
  );

  assert.ok(token);

  return token;
}

function publicDependencies(
  visitors: TableClient,
  reservations: TableClient
): PermanentPublicRegistrationDependencies {
  return {
    enabled: true,
    familyEnabled: true,
    context: publicContext,
    signingSecret: publicSigningSecret,
    claimSecret: publicClaimSecret,
    capacity: 10,
    store:
      createPermanentVisitorQrReservationStore(
        reservations
      ),
    recordAdult: input =>
      recordVisitorArrival(
        input,
        actualLocalArrival(visitors)
      )
  };
}

async function withPublicTables(
  run: (
    visitors: TableClient,
    reservations: TableClient
  ) => Promise<void>
): Promise<void> {
  await withTable(visitors =>
    withTable(reservations =>
      run(visitors, reservations)
    )
  );
}

async function publicRowCount(
  table: TableClient
): Promise<number> {
  let count = 0;

  for await (const _ of table.listEntities()) {
    count++;
  }

  return count;
}

test("complete public registration saves new and returning visitors through actual local storage", async () => {
  await withPublicTables(async (
    visitors, reservations
  ) => {
    const deps = publicDependencies(
      visitors, reservations
    );

    const firstRequest = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: publicBody
    };

    assert.deepEqual(
      await submitPublic(firstRequest, deps),
      { accepted: true, status: "recorded" }
    );

    const first = await visitors.getEntity<{
      visitorId: string;
      registrationDetailsJson: string;
    }>(
      "VISITOR_CHECK_IN",
      firstRequest.submissionId
    );

    const details = JSON.parse(
      first.registrationDetailsJson
    );

    assert.equal(details.email, publicBody.email);
    assert.equal(details.phone, publicBody.phone);
    assert.equal(details.visitType, "first");
    assert.equal(details.churchHome, "looking");
    assert.equal(details.contactConsent, false);
    assert.equal(
      details.invitedBy,
      publicBody.invitedBy
    );

    assert.deepEqual(
      details.interests,
      ["church_events", "prayer"]
    );

    // Declined consent did not block attendance.
    // Exact retry does not create another visit.
    assert.deepEqual(
      await submitPublic(firstRequest, deps),
      { accepted: true, status: "recorded" }
    );

    assert.equal(
      await publicRowCount(reservations),
      3
    );

    const laterContext = {
      ...publicContext,
      nowMs: Date.parse("2026-11-25T19:00:00Z")
    };

    const returningRequest = {
      token: publicSession(laterContext),
      submissionId:
        "22222222-2222-4222-8222-222222222222",
      body: {
        ...publicBody,
        visitType: "returning",
        contactConsent: true
      }
    };

    assert.deepEqual(
      await submitPublic(returningRequest, {
        ...deps,
        context: laterContext
      }),
      { accepted: true, status: "recorded" }
    );

    const returning = await visitors.getEntity<{
      visitorId: string;
      serviceId: string;
      registrationDetailsJson: string;
    }>(
      "VISITOR_CHECK_IN",
      returningRequest.submissionId
    );

    assert.equal(
      returning.visitorId,
      first.visitorId
    );

    assert.equal(
      returning.serviceId,
      "visit-2026-11-25"
    );

    assert.equal(
      JSON.parse(
        returning.registrationDetailsJson
      ).contactConsent,
      true
    );

    let people = 0;
    let visits = 0;

    for await (const row of visitors.listEntities()) {
      if (row.partitionKey === "VISITOR") people++;
      if (row.partitionKey === "VISITOR_CHECK_IN") visits++;
    }

    assert.equal(people, 1);
    assert.equal(visits, 2);

    assert.equal(
      await publicRowCount(reservations),
      6
    );
  });
});

test("invalid or disabled public registration never reaches a canonical writer", async () => {
  await withPublicTables(async (
    visitors, reservations
  ) => {
    const deps = publicDependencies(
      visitors, reservations
    );

    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: publicBody
    };

    const invalid = await submitPublic({
      ...request,
      body: {
        ...publicBody,
        contactConsent: "yes"
      }
    }, deps);

    assert.deepEqual(invalid, {
      accepted: false,
      status: "invalid"
    });

    assert.deepEqual(
      await submitPublic(request, {
        ...deps,
        enabled: false
      }),
      {
        accepted: false,
        status: "unavailable"
      }
    );

    assert.deepEqual(
      await submitPublic({
        ...request,
        token: "invalid-session"
      }, deps),
      {
        accepted: false,
        status: "admission_denied"
      }
    );

    assert.equal(
      await publicRowCount(visitors),
      0
    );

    assert.equal(
      await publicRowCount(reservations),
      0
    );
  });
});

test("changing consent on an admitted submission cannot overwrite the original visit", async () => {
  await withPublicTables(async (
    visitors, reservations
  ) => {
    const deps = publicDependencies(
      visitors, reservations
    );

    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: publicBody
    };

    assert.deepEqual(
      await submitPublic(request, deps),
      { accepted: true, status: "recorded" }
    );

    assert.deepEqual(
      await submitPublic({
        ...request,
        body: {
          ...publicBody,
          contactConsent: true
        }
      }, deps),
      {
        accepted: false,
        status: "submission_conflict"
      }
    );

    const row = await visitors.getEntity<{
      registrationDetailsJson: string;
    }>(
      "VISITOR_CHECK_IN",
      request.submissionId
    );

    assert.equal(
      JSON.parse(
        row.registrationDetailsJson
      ).contactConsent,
      false
    );
  });
});

test("missing family writer does not consume admission capacity and incomplete family is not confirmed", async () => {
  await withPublicTables(async (
    visitors, reservations
  ) => {
    const deps = publicDependencies(
      visitors, reservations
    );

    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: {
        ...publicBody,
        family: {
          guardianName: publicBody.name,
          guardianDeclaration: true,
          children: [
            {
              firstName: "Synthetic Child",
              ageGroup: "6-11"
            }
          ]
        }
      }
    };

    assert.deepEqual(
      await submitPublic(request, deps),
      {
        accepted: false,
        status: "unavailable"
      }
    );

    assert.equal(
      await publicRowCount(reservations),
      0
    );

    const incomplete = await submitPublic(
      request,
      {
        ...deps,
        recordFamily: input =>
          recordVisitorFamilyCheckIn(input, {
            arrival: adult =>
              recordVisitorArrival(
                adult,
                actualLocalArrival(visitors)
              ),
            async saveFamily() {
              throw new Error(
                "Synthetic family storage failure"
              );
            }
          })
      }
    );

    assert.deepEqual(incomplete, {
      accepted: false,
      status: "try_later"
    });

    // Adult attendance may already exist.
    // The public result still must not be recorded.
    const adult = await visitors.getEntity(
      "VISITOR_CHECK_IN",
      request.submissionId
    );

    assert.equal(
      adult.rowKey,
      request.submissionId
    );
  });
});

test("selected event must match the automatic session authority", async () => {
  await withPublicTables(async (
    visitors, reservations
  ) => {
    const context = {
      ...publicContext,
      approvedEvents: [
        {
          id: "synthetic-event-one",
          date: "2026-11-24",
          name: "Synthetic Event One",
          active: true
        },
        {
          id: "synthetic-event-two",
          date: "2026-11-24",
          name: "Synthetic Event Two",
          active: true
        }
      ]
    };

    const deps = {
      ...publicDependencies(
        visitors, reservations
      ),
      context
    };

    const request = {
      token: publicSession({
        ...context,
        selectedEventId: "synthetic-event-one"
      }),
      submissionId: command.submissionId,
      body: publicBody
    };

    assert.deepEqual(
      await submitPublic(request, deps),
      {
        accepted: false,
        status: "selection_required"
      }
    );

    assert.deepEqual(
      await submitPublic({
        ...request,
        body: {
          ...publicBody,
          eventId: "synthetic-event-two"
        }
      }, deps),
      {
        accepted: false,
        status: "admission_denied"
      }
    );

    assert.equal(
      await publicRowCount(reservations),
      0
    );

    assert.deepEqual(
      await submitPublic({
        ...request,
        body: {
          ...publicBody,
          eventId: "synthetic-event-one"
        }
      }, deps),
      { accepted: true, status: "recorded" }
    );
  });
});

async function withEnrollmentTables(
  run: (
    visitors: TableClient,
    reservations: TableClient,
    followups: SixWeekFollowupEventsRepository
  ) => Promise<void>
): Promise<void> {
  await withPublicTables((visitors, reservations) =>
    withTable(events =>
      run(
        visitors,
        reservations,
        new SixWeekFollowupEventsRepository(events)
      )
    )
  );
}

function enrollmentDependencies(
  visitors: TableClient,
  reservations: TableClient,
  followups: SixWeekFollowupEventsRepository
): PermanentPublicRegistrationDependencies {
  return {
    ...publicDependencies(visitors, reservations),
    automaticFollowupEnabled: true,
    enrollFollowup: evidence =>
      enrollRecordedPublicVisitor(evidence, {
        enabled: true,
        visitors,
        repository: followups
      })
  };
}

test("consented public registration durably creates exactly one unassigned six-week staff plan", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: {
        ...publicBody,
        contactConsent: true
      }
    };

    assert.deepEqual(
      await submitPublic(request, deps),
      { accepted: true, status: "recorded" }
    );

    const receipt = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", request.submissionId);

    const events = await followups.listByVisitor(
      receipt.visitorId
    );

    assert.equal(events.length, 1);

    const plan = projectSixWeekVisitorFollowup(
      events,
      "2026-11-24T20:00:00.000Z"
    );

    assert.ok(plan);
    assert.equal(plan.tasks.length, 6);
    assert.equal(plan.ownerStaffId, null);
    assert.equal(plan.needsOwner, true);
    assert.equal(plan.contactConsent, true);
    assert.equal(plan.firstVisitDate, "2026-11-24");
    assert.equal(
      plan.startedBy,
      "system:permanent-visitor-registration"
    );

    assert.deepEqual(
      await submitPublic(request, deps),
      { accepted: true, status: "recorded" }
    );

    assert.equal(
      (await followups.listByVisitor(
        receipt.visitorId
      )).length,
      1
    );
  });
});

test("declined public consent records attendance without creating follow-up events", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    assert.deepEqual(
      await submitPublic({
        token: publicSession(),
        submissionId: command.submissionId,
        body: {
          ...publicBody,
          contactConsent: false
        }
      }, deps),
      { accepted: true, status: "recorded" }
    );

    const receipt = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", command.submissionId);

    assert.equal(
      (await followups.listByVisitor(
        receipt.visitorId
      )).length,
      0
    );
  });
});

test("automatic enrollment cannot occur without the matching durable visit receipt", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const result = await enrollRecordedPublicVisitor({
      visitorId: "synthetic-unrecorded-visitor",
      submissionId: command.submissionId,
      serviceId: command.serviceId,
      visitDate: "2026-11-24"
    }, {
      enabled: true,
      visitors,
      repository: followups
    });

    assert.equal(result, "unavailable");

    assert.equal(
      (await followups.listByVisitor(
        "synthetic-unrecorded-visitor"
      )).length,
      0
    );
  });
});

test("uncertain enrollment can resume from the same recorded submission without another visit", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: {
        ...publicBody,
        contactConsent: true
      }
    };

    assert.deepEqual(
      await submitPublic(request, {
        ...deps,
        enrollFollowup: async () => "unavailable"
      }),
      { accepted: false, status: "try_later" }
    );

    const receipt = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", request.submissionId);

    assert.deepEqual(
      await submitPublic(request, deps),
      { accepted: true, status: "recorded" }
    );

    let visits = 0;

    for await (const row of visitors.listEntities()) {
      if (row.partitionKey === "VISITOR_CHECK_IN") {
        visits++;
      }
    }

    assert.equal(visits, 1);

    assert.equal(
      (await followups.listByVisitor(
        receipt.visitorId
      )).length,
      1
    );
  });
});

test("concurrent automatic enrollment uses the existing unique plan-start boundary", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const request = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: {
        ...publicBody,
        contactConsent: true
      }
    };

    assert.deepEqual(
      await submitPublic(
        request,
        publicDependencies(visitors, reservations)
      ),
      { accepted: true, status: "recorded" }
    );

    const receipt = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", request.submissionId);

    const evidence = {
      visitorId: receipt.visitorId,
      submissionId: request.submissionId,
      serviceId: command.serviceId,
      visitDate: "2026-11-24"
    };

    const deps = {
      enabled: true,
      visitors,
      repository: followups
    };

    const outcomes = await Promise.all([
      enrollRecordedPublicVisitor(evidence, deps),
      enrollRecordedPublicVisitor(evidence, deps)
    ]);

    assert.deepEqual(
      outcomes.sort(),
      ["enrolled", "existing"]
    );

    assert.equal(
      (await followups.listByVisitor(
        receipt.visitorId
      )).length,
      1
    );
  });
});

test("later declined registration closes outstanding follow-up without deleting attendance", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    const first = {
      token: publicSession(),
      submissionId: command.submissionId,
      body: {
        ...publicBody,
        contactConsent: true
      }
    };

    assert.deepEqual(
      await submitPublic(first, deps),
      { accepted: true, status: "recorded" }
    );

    const receipt = await visitors.getEntity<{
      visitorId: string;
      recordedAt: string;
    }>("VISITOR_CHECK_IN", first.submissionId);

    const visitorId = receipt.visitorId;

    await followups.append({
      eventId: "evt-synthetic-completed-week-one",
      visitorId,
      type: "six_week_followup.task_completed",
      actorId: "synthetic-staff",
      occurredAt: receipt.recordedAt,
      data: {
        weekNumber: 1,
        contactMethod: "call",
        outcome: "Synthetic historical contact"
      }
    });

    const laterContext = {
      ...publicContext,
      nowMs: publicContext.nowMs + 86400000
    };

    const decline = {
      token: publicSession(laterContext),
      submissionId:
        "22222222-2222-4222-8222-222222222222",
      body: {
        ...publicBody,
        visitType: "returning",
        contactConsent: false
      }
    };

    const laterDeps = {
      ...deps,
      context: laterContext
    };

    assert.deepEqual(
      await submitPublic(decline, laterDeps),
      { accepted: true, status: "recorded" }
    );

    const plan = projectSixWeekVisitorFollowup(
      await followups.listByVisitor(visitorId)
    );

    assert.ok(plan);
    assert.equal(plan.status, "cancelled");
    assert.equal(plan.nextTask, null);
    assert.equal(plan.tasks[0].status, "completed");

    assert.ok(plan.tasks.slice(1).every(
      task => task.status === "cancelled"
    ));

    assert.equal(
      plan.cancellationReason,
      "Visitor withdrew follow-up permission"
    );

    assert.deepEqual(
      await submitPublic(decline, laterDeps),
      { accepted: true, status: "recorded" }
    );

    const events = await followups.listByVisitor(
      visitorId
    );

    assert.equal(events.filter(event =>
      event.type === "six_week_followup.plan_cancelled"
    ).length, 1);

    let visits = 0;

    for await (const row of visitors.listEntities()) {
      if (row.partitionKey === "VISITOR_CHECK_IN") {
        visits++;
      }
    }

    assert.equal(visits, 2);
  });
});

test("concurrent consent withdrawals create one durable closure", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    assert.deepEqual(
      await submitPublic({
        token: publicSession(),
        submissionId: command.submissionId,
        body: {
          ...publicBody,
          contactConsent: true
        }
      }, deps),
      { accepted: true, status: "recorded" }
    );

    const first = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", command.submissionId);

    const laterContext = {
      ...publicContext,
      nowMs: publicContext.nowMs + 86400000
    };

    const request = {
      token: publicSession(laterContext),
      submissionId:
        "22222222-2222-4222-8222-222222222222",
      body: {
        ...publicBody,
        visitType: "returning",
        contactConsent: false
      }
    };

    // Record the decline before concurrent reconciliation.
    assert.deepEqual(
      await submitPublic(request, {
        ...publicDependencies(visitors, reservations),
        context: laterContext
      }),
      { accepted: true, status: "recorded" }
    );

    const evidence = {
      visitorId: first.visitorId,
      submissionId: request.submissionId,
      serviceId: "visit-2026-11-25",
      visitDate: "2026-11-25"
    };

    const reconcileDeps = {
      enabled: true,
      visitors,
      repository: followups
    };

    const results = await Promise.all([
      enrollRecordedPublicVisitor(
        evidence, reconcileDeps
      ),
      enrollRecordedPublicVisitor(
        evidence, reconcileDeps
      )
    ]);

    assert.deepEqual(results, [
      "not_eligible",
      "not_eligible"
    ]);

    const events = await followups.listByVisitor(
      first.visitorId
    );

    assert.equal(events.filter(event =>
      event.type === "six_week_followup.plan_cancelled"
    ).length, 1);
  });
});

test("a later ordinary resume cannot reopen a public consent withdrawal", () => {
  const visitorId = "synthetic-consent-closed";

  const plan = projectSixWeekVisitorFollowup([
    {
      eventId: "evt-start",
      visitorId,
      type: "six_week_followup.plan_started",
      occurredAt: "2026-11-24T18:00:00.000Z",
      actorId: "synthetic-staff",
      data: {
        firstVisitDate: "2026-11-24",
        contactConsent: true,
        ownerStaffId: null
      }
    },
    {
      eventId: "evt-withdrawal",
      visitorId,
      type: "six_week_followup.plan_cancelled",
      occurredAt: "2026-11-25T18:00:00.000Z",
      actorId: "system:permanent-visitor-registration",
      data: {
        reason:
          "Visitor withdrew follow-up permission"
      }
    },
    {
      eventId: "evt-later-resume",
      visitorId,
      type: "six_week_followup.plan_resumed",
      occurredAt: "2026-11-26T18:00:00.000Z",
      actorId: "synthetic-staff",
      data: {}
    }
  ]);

  assert.ok(plan);
  assert.equal(plan.status, "cancelled");
  assert.equal(plan.nextTask, null);

  assert.ok(plan.tasks.every(
    task => task.status === "cancelled"
  ));
});

test("subsequent permission does not automatically restart a consent-closed plan", async () => {
  await withEnrollmentTables(async (
    visitors, reservations, followups
  ) => {
    const deps = enrollmentDependencies(
      visitors, reservations, followups
    );

    const visits = [
      {
        submissionId: command.submissionId,
        contactConsent: true
      },
      {
        submissionId:
          "22222222-2222-4222-8222-222222222222",
        contactConsent: false
      },
      {
        submissionId:
          "33333333-3333-4333-8333-333333333333",
        contactConsent: true
      }
    ];

    for (let index = 0; index < visits.length; index++) {
      const visit = visits[index];

      const context = {
        ...publicContext,
        nowMs:
          publicContext.nowMs + index * 86400000
      };

      assert.deepEqual(
        await submitPublic({
          token: publicSession(context),
          submissionId: visit.submissionId,
          body: {
            ...publicBody,
            visitType: index === 0
              ? "first" : "returning",
            contactConsent: visit.contactConsent
          }
        }, {
          ...deps,
          context
        }),
        { accepted: true, status: "recorded" }
      );
    }

    const receipt = await visitors.getEntity<{
      visitorId: string;
    }>("VISITOR_CHECK_IN", command.submissionId);

    const events = await followups.listByVisitor(
      receipt.visitorId
    );

    assert.equal(events.filter(event =>
      event.type === "six_week_followup.plan_started"
    ).length, 1);

    assert.equal(events.filter(event =>
      event.type === "six_week_followup.plan_cancelled"
    ).length, 1);

    const plan = projectSixWeekVisitorFollowup(events);

    assert.ok(plan);
    assert.equal(plan.status, "cancelled");
    assert.equal(plan.nextTask, null);
  });
});
