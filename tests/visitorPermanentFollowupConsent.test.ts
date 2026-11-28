import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import type { TableClient } from "@azure/data-tables";
import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";

import {
  readLatestRegistrationConsent as readConsent,
  startConsentProtectedSixWeekFollowup as startProtected
} from "../src/services/followups/startConsentProtectedSixWeekFollowup";

import {
  startSixWeekVisitorFollowup
} from "../src/services/followups/sixWeekVisitorFollowupCommands";

import type {
  SixWeekFollowupEvent
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

const visitorId = "synthetic-consent-visitor";

const staffInput = {
  visitorId,
  firstVisitDate: "2026-11-24",
  contactConsent: true,
  actorId: "synthetic-active-staff"
};

async function withTable(
  run: (table: TableClient) => Promise<void>
): Promise<void> {
  assert.equal(
    process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE,
    "true"
  );

  const table = createIsolatedVisitorTestTable(

    "HopeVisitor67F" +
      randomUUID().replace(/-/g, "")
  );

  const endpoint = new URL(table.url);

  assert.equal(endpoint.protocol, "http:");
  assert.equal(endpoint.hostname, "127.0.0.1");
  assert.equal(endpoint.port, process.env.HOPE_VISITOR_133_PORT);
  assert.notEqual(endpoint.port, "10002");
  assert.equal(
    endpoint.pathname.replace(/\/$/, ""),
    "/hopevisitor133"
  );

  await table.createTable();

  try {
    await run(table);
  } finally {
    await table.deleteTable();
  }
}

async function saveVisit(
  table: TableClient,
  consent: boolean,
  recordedAt: string,
  id = visitorId
): Promise<void> {
  await table.createEntity({
    partitionKey: "VISITOR_CHECK_IN",
    rowKey: randomUUID(),
    visitorId: id,
    serviceId: "visit-2026-11-24",
    recordedAt,
    registrationDetailsJson: JSON.stringify({
      version: 1,
      contactConsent: consent
    })
  });
}

function staffFixture(table?: TableClient, active = true) {
  const events: SixWeekFollowupEvent[] = [];

  const start: typeof startSixWeekVisitorFollowup =
    input => startSixWeekVisitorFollowup(input, {
      visitorExists: async id =>
        id === visitorId,

      readActor: async id => ({
        staffId: id,
        status: active ? "active" : "inactive"
      }),

      readRegistrationConsent: async id => {
        if (!table) throw new Error("Isolated consent fixture table required");
        return readConsent(id, table);
      },

      now: () => "2026-11-24T20:00:00.000Z",

      newEventId: () => "evt-synthetic-consent",

      repository: {
        async append(event) {
          events.push(event);
          return true;
        },

        async listByVisitor(id) {
          return events.filter(event =>
            event.visitorId === id
          );
        }
      }
    });

  return { start, events };
}

test("latest explicit decline prevents a new follow-up plan", async () => {
  await withTable(async table => {
    await saveVisit(
      table, true,
      "2026-11-24T17:00:00.000Z"
    );

    await saveVisit(
      table, false,
      "2026-11-24T18:00:00.000Z"
    );

    // Another visitor's consent cannot grant permission.
    await saveVisit(
      table, true,
      "2026-11-24T19:00:00.000Z",
      "synthetic-other-visitor"
    );

    const staff = staffFixture(table);

    assert.equal(
      await readConsent(visitorId, table),
      "declined"
    );

    const result = await startProtected(staffInput, {
      readConsent: id => readConsent(id, table),
      start: staff.start
    });

    assert.equal(result.accepted, false);
    assert.equal(result.status, 409);
    assert.equal(staff.events.length, 0);
  });
});

test("later explicit permission allows authorized Staff to start six-week follow-up", async () => {
  await withTable(async table => {
    await saveVisit(
      table, false,
      "2026-11-24T17:00:00.000Z"
    );

    await saveVisit(
      table, true,
      "2026-11-24T18:00:00.000Z"
    );

    const staff = staffFixture(table);

    const result = await startProtected(staffInput, {
      readConsent: id => readConsent(id, table),
      start: staff.start
    });

    assert.equal(result.accepted, true);

    if (result.accepted) {
      assert.equal(result.plan.tasks.length, 6);
      assert.equal(result.plan.contactConsent, true);
      assert.equal(
        result.plan.startedBy,
        staffInput.actorId
      );
    }

    assert.equal(staff.events.length, 1);

    assert.equal(
      staff.events[0].type,
      "six_week_followup.plan_started"
    );
  });
});

test("decline wins when stored consent timestamps are identical", async () => {
  await withTable(async table => {
    const same = "2026-11-24T18:00:00.000Z";

    await saveVisit(table, true, same);
    await saveVisit(table, false, same);

    assert.equal(
      await readConsent(visitorId, table),
      "declined"
    );
  });
});

test("unknown or malformed stored consent fails closed", async () => {
  await withTable(async table => {
    await table.createEntity({
      partitionKey: "VISITOR_CHECK_IN",
      rowKey: randomUUID(),
      visitorId,
      recordedAt: "2026-11-24T18:00:00.000Z",
      registrationDetailsJson: JSON.stringify({
        version: 1,
        contactConsent: "yes"
      })
    });

    const staff = staffFixture(table);

    assert.equal(
      await readConsent(visitorId, table),
      "unavailable"
    );

    for (const reader of [
      (id: string) => readConsent(id, table),
      async (_id: string): Promise<never> => {
        throw new Error("Synthetic storage failure");
      }
    ]) {
      const result = await startProtected(staffInput, {
        readConsent: reader,
        start: staff.start
      });

      assert.equal(result.accepted, false);
      assert.equal(result.status, 503);
    }

    assert.equal(staff.events.length, 0);
  });
});

test("legacy attendance preserves authorized Staff consent workflow", async () => {
  await withTable(async table => {
    await table.createEntity({
      partitionKey: "VISITOR_CHECK_IN",
      rowKey: randomUUID(),
      visitorId,
      recordedAt: "2026-11-24T18:00:00.000Z"
    });

    assert.equal(
      await readConsent(visitorId, table),
      "legacy_no_evidence"
    );

    const staff = staffFixture(table);

    const result = await startProtected(staffInput, {
      readConsent: id => readConsent(id, table),
      start: staff.start
    });

    assert.equal(result.accepted, true);
    assert.equal(staff.events.length, 1);
  });
});

test("stored permission never bypasses active Staff authorization", async () => {
  await withTable(async table => {
    await saveVisit(
      table, true,
      "2026-11-24T18:00:00.000Z"
    );

    const staff = staffFixture(table, false);

    const result = await startProtected(staffInput, {
      readConsent: id => readConsent(id, table),
      start: staff.start
    });

    assert.equal(result.accepted, false);
    assert.equal(staff.events.length, 0);
  });
});

test("explicit Staff consent confirmation remains mandatory", async () => {
  const staff = staffFixture();

  const result = await startProtected({
    ...staffInput,
    contactConsent: false
  }, {
    readConsent: async () => "granted",
    start: staff.start
  });

  assert.equal(result.accepted, false);
  assert.equal(result.status, 400);
  assert.equal(staff.events.length, 0);
});
