import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  postPermanentPublicVisitSession as handler
} from "../src/functions/postPermanentPublicVisitSession";

import {
  reservePermanentPublicSessionCapacity as reserve
} from "../src/services/visitors/reservePermanentPublicSessionCapacity";

import {
  verifyPermanentPublicVisitSession
} from "../src/services/visitors/permanentPublicVisitSession";

const nowMs = Date.parse(
  "2026-11-24T19:00:00Z"
);

const bridge =
  "synthetic-permanent-visit-bridge-key";

const signing =
  "synthetic-independent-session-signing-key";

const headers = {
  "x-hope-public-visit-key": bridge
};

process.env.FEATURE_PERMANENT_PUBLIC_VISIT = "true";
process.env.FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP = "true";
process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = "true";
process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY = bridge;
process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET = signing;
process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET = "synthetic-independent-admission-claim-secret";

type Request = Parameters<typeof handler>[1];
type Dependencies = NonNullable<
  Parameters<typeof handler>[2]
>;

function fixture(
  overrides: Dependencies = {}
) {
  let reads = 0;
  let writes = 0;

  const deps: Dependencies = {
    now: () => nowMs,

    approvedEvents: async date => {
      assert.equal(date, "2026-11-24");
      reads++;
      return [];
    },

    reserve: async () => {
      writes++;
      return "reserved";
    },

    ...overrides
  };

  async function call(
    changed: Partial<Request> = {}
  ) {
    const context: Parameters<typeof handler>[0] = {};

    await handler(context, {
      method: "POST",
      headers,
      body: {},
      ...changed
    }, deps);

    assert.ok(context.res);
    assert.equal(
      context.res.headers["cache-control"],
      "no-store"
    );

    return context.res;
  }

  return {
    call,
    reads: () => reads,
    writes: () => writes
  };
}

test("disabled issuance and disabled consent guard deny requests before storage", async () => {
  const f = fixture();

  for (const flag of [
    "FEATURE_PERMANENT_PUBLIC_VISIT",
    "FEATURE_PERMANENT_VISITOR_CONSENT_GUARD",
    "FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP"
  ]) {
    const previous = process.env[flag];

    try {
      delete process.env[flag];

      assert.equal(
        (await f.call()).status,
        404
      );
    } finally {
      process.env[flag] = previous!;
    }
  }

  assert.equal(f.reads(), 0);
  assert.equal(f.writes(), 0);
});

test("missing or incorrect bridge authorization cannot issue a session", async () => {
  const f = fixture();

  for (const supplied of [
    {},
    { "x-hope-public-visit-key": "wrong" }
  ]) {
    const response = await f.call({
      headers: supplied
    });

    assert.equal(response.status, 401);
    assert.equal("token" in response.body, false);
  }

  assert.equal(f.reads(), 0);
  assert.equal(f.writes(), 0);
});

test("automatic weekday session is issued without a device or owner activation", async () => {
  const f = fixture();
  const result = await f.call();

  assert.equal(result.status, 200);
  assert.equal(result.body.status, "ready");

  assert.deepEqual(result.body.event, {
    serviceId: "visit-2026-11-24",
    date: "2026-11-24",
    name: "General Visit"
  });

  assert.equal(typeof result.body.token, "string");

  assert.ok(verifyPermanentPublicVisitSession(
    result.body.token,
    signing,
    {
      enabled: true,
      nowMs,
      approvedEvents: []
    }
  ));

  assert.equal(f.writes(), 1);
  assert.equal(
    JSON.stringify(result.body).includes(bridge),
    false
  );
  assert.equal(
    JSON.stringify(result.body).includes(signing),
    false
  );
});

test("multiple events require selection before consuming issuance capacity", async () => {
  const events = [
    {
      id: "synthetic-event-one",
      date: "2026-11-24",
      name: "Event One",
      active: true
    },
    {
      id: "synthetic-event-two",
      date: "2026-11-24",
      name: "Event Two",
      active: true
    }
  ];

  const f = fixture({
    approvedEvents: async () => events
  });

  const choice = await f.call();

  assert.equal(choice.status, 409);
  assert.equal(
    choice.body.status,
    "selection_required"
  );
  assert.equal("token" in choice.body, false);
  assert.equal(f.writes(), 0);

  const selected = await f.call({
    body: {
      eventId: "synthetic-event-two"
    }
  });

  assert.equal(selected.status, 200);

  assert.ok(verifyPermanentPublicVisitSession(
    selected.body.token,
    signing,
    {
      enabled: true,
      nowMs,
      approvedEvents: events,
      selectedEventId: "synthetic-event-two"
    }
  ));

  assert.equal(f.writes(), 1);
});

test("invalid event or browser-supplied authority is denied", async () => {
  const f = fixture();

  for (const body of [
    { eventId: "unknown-event" },
    { date: "2026-11-25" },
    { deviceId: "synthetic-device" },
    { actorId: "synthetic-staff" },
    { ownerActivated: true },
    { eventId: null },
    []
  ]) {
    const result = await f.call({ body });

    assert.equal(result.status, 400);
    assert.equal("token" in result.body, false);
  }

  assert.equal(f.writes(), 0);
});

test("exhausted or uncertain issuance capacity never returns a session", async () => {
  for (const capacity of [
    "capacity_exhausted",
    "unavailable"
  ] as const) {
    const f = fixture({
      reserve: async () => capacity
    });

    const result = await f.call();

    assert.equal(
      result.status,
      capacity === "capacity_exhausted"
        ? 429 : 503
    );

    assert.equal("token" in result.body, false);
  }
});

test("same bridge and signing secret fails closed", async () => {
  const previous =
    process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET;

  try {
    process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET =
      bridge;

    const f = fixture();

    assert.equal(
      (await f.call()).status,
      503
    );

    assert.equal(f.reads(), 0);
    assert.equal(f.writes(), 0);
  } finally {
    process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET =
      previous!;
  }
});

test("global issuance limit survives concurrent independent clients and minute rollover", async () => {
  assert.equal(
    process.env.HOPE_VISITOR_57_LOCAL_ACCEPTANCE,
    "true"
  );

  const tableName =
    "HopeVisitor69" +
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
    const clients = Array.from(
      { length: 5 },
      () => TableClient.fromConnectionString(
        "UseDevelopmentStorage=true",
        tableName
      )
    );

    const results = await Promise.all(
      clients.map(client =>
        reserve(client, nowMs, 2)
      )
    );

    assert.equal(
      results.filter(
        result => result === "reserved"
      ).length,
      2
    );

    assert.equal(
      results.filter(
        result => result === "capacity_exhausted"
      ).length,
      3
    );

    assert.equal(
      await reserve(table, nowMs + 60000, 2),
      "reserved"
    );

    const rows: unknown[] = [];

    for await (const row of table.listEntities()) {
      rows.push(row);

      assert.deepEqual(
        Object.keys(row).filter(key =>
          !["etag", "timestamp"].includes(key)
        ).sort(),
        ["partitionKey", "rowKey", "version"]
      );
    }

    assert.equal(rows.length, 3);
  } finally {
    await table.deleteTable();
  }
});

test("session issuance requires an independent admission claim secret", async () => {
  const key = "HOPE_PERMANENT_VISIT_CLAIM_SECRET";
  const previous = process.env[key];

  try {
    for (const invalid of [
      undefined,
      bridge,
      signing,
      "short"
    ]) {
      if (invalid === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = invalid;
      }

      const f = fixture();
      const result = await f.call();

      assert.equal(result.status, 503);
      assert.equal("token" in result.body, false);
      assert.equal(f.reads(), 0);
      assert.equal(f.writes(), 0);
    }
  } finally {
    if (previous === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = previous;
    }
  }
});
