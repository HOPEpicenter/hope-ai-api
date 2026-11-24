import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  reservePermanentPublicVisitRequest,
  PUBLIC_VISIT_REQUEST_LIMITS,
  type RequestBudgetTable,
  type PublicVisitRequestBudgetResult
} from "../src/services/visitors/reservePermanentPublicVisitRequest";

import {
  postPermanentPublicVisitSession
} from "../src/functions/postPermanentPublicVisitSession/index";

import {
  postPermanentPublicVisitRegistration
} from "../src/functions/postPermanentPublicVisitRegistration/index";

type Counter = {
  partitionKey: string;
  rowKey: string;
  version: number;
  count: number;
  etag: string;
};

class SyntheticTable {
  rows = new Map<string, Counter>();
  reads = 0;
  writes = 0;
  revision = 0;
  readFailure: number | null = null;
  updateFailure: number | null = null;
  uncertainCreate = false;

  private key(p: string, r: string) {
    return `${p}/${r}`;
  }

  async getEntity(p: string, r: string) {
    this.reads++;

    if (this.readFailure !== null) {
      throw { statusCode: this.readFailure };
    }

    const row = this.rows.get(this.key(p, r));

    if (!row) {
      throw { statusCode: 404 };
    }

    return { ...row };
  }

  async createEntity(
    entity: Omit<Counter, "etag">
  ) {
    this.writes++;

    const key = this.key(
      entity.partitionKey,
      entity.rowKey
    );

    if (this.rows.has(key)) {
      throw { statusCode: 409 };
    }

    this.rows.set(key, {
      ...entity,
      etag: String(++this.revision)
    });

    if (this.uncertainCreate) {
      throw { statusCode: 503 };
    }
  }

  async updateEntity(
    entity: Omit<Counter, "etag">,
    mode: string,
    options: { etag: string }
  ) {
    this.writes++;

    assert.equal(mode, "Replace");

    const key = this.key(
      entity.partitionKey,
      entity.rowKey
    );

    const current = this.rows.get(key);

    if (this.updateFailure !== null) {
      throw { statusCode: this.updateFailure };
    }

    if (!current || current.etag !== options.etag) {
      throw { statusCode: 412 };
    }

    this.rows.set(key, {
      ...entity,
      etag: String(++this.revision)
    });
  }

  client(): RequestBudgetTable {
    return this as unknown as RequestBudgetTable;
  }
}

const now = Date.parse("2026-11-24T17:00:00Z");

test("session requests stop at the exact durable limit", async () => {
  const table = new SyntheticTable();

  for (
    let n = 0;
    n < PUBLIC_VISIT_REQUEST_LIMITS.session;
    n++
  ) {
    assert.equal(
      await reservePermanentPublicVisitRequest(
        table.client(), "session", now
      ),
      "reserved"
    );
  }

  const writes = table.writes;

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "capacity_exhausted"
  );

  assert.equal(table.writes, writes);
  assert.equal(table.rows.size, 1);
});

test("registration and session budgets are independent", async () => {
  const table = new SyntheticTable();

  for (
    let n = 0;
    n < PUBLIC_VISIT_REQUEST_LIMITS.registration;
    n++
  ) {
    assert.equal(
      await reservePermanentPublicVisitRequest(
        table.client(), "registration", now
      ),
      "reserved"
    );
  }

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "registration", now
    ),
    "capacity_exhausted"
  );

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "reserved"
  );

  assert.equal(table.rows.size, 2);
});

test("a new minute creates an independent budget", async () => {
  const table = new SyntheticTable();

  for (const time of [now, now + 60000]) {
    assert.equal(
      await reservePermanentPublicVisitRequest(
        table.client(), "session", time
      ),
      "reserved"
    );
  }

  assert.equal(table.rows.size, 2);

  for (const row of table.rows.values()) {
    assert.equal(row.count, 1);
  }
});

test("concurrent requests cannot exceed capacity or lose updates", async () => {
  const table = new SyntheticTable();

  for (let n = 0; n < 119; n++) {
    assert.equal(
      await reservePermanentPublicVisitRequest(
        table.client(), "session", now
      ),
      "reserved"
    );
  }

  const results = await Promise.all(
    Array.from({ length: 12 }, () =>
      reservePermanentPublicVisitRequest(
        table.client(), "session", now
      )
    )
  );

  assert.equal(
    results.filter(x => x === "reserved").length,
    1
  );

  const row = [...table.rows.values()][0];

  assert.equal(row.count, 120);
});

test("contention retries are bounded", async () => {
  const table = new SyntheticTable();

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "reserved"
  );

  table.updateFailure = 412;

  const reads = table.reads;
  const writes = table.writes;

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "unavailable"
  );

  assert.equal(table.reads - reads, 16);
  assert.equal(table.writes - writes, 16);
});

test("storage failures and uncertain writes fail closed", async () => {
  const unavailable = new SyntheticTable();

  unavailable.readFailure = 503;

  assert.equal(
    await reservePermanentPublicVisitRequest(
      unavailable.client(), "session", now
    ),
    "unavailable"
  );

  assert.equal(unavailable.writes, 0);

  const uncertain = new SyntheticTable();

  uncertain.uncertainCreate = true;

  assert.equal(
    await reservePermanentPublicVisitRequest(
      uncertain.client(), "registration", now
    ),
    "unavailable"
  );

  assert.equal(uncertain.writes, 1);
  assert.equal(uncertain.rows.size, 1);
});

test("invalid counters and invalid clocks are denied", async () => {
  const table = new SyntheticTable();

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", NaN
    ),
    "unavailable"
  );

  assert.equal(table.reads, 0);

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "reserved"
  );

  const row = [...table.rows.values()][0];

  row.etag = "*";

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "unavailable"
  );

  row.etag = "valid-test-etag";
  row.count = -1;

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "session", now
    ),
    "unavailable"
  );
});

test("quota rows contain no visitor or device information", async () => {
  const table = new SyntheticTable();

  assert.equal(
    await reservePermanentPublicVisitRequest(
      table.client(), "registration", now
    ),
    "reserved"
  );

  const row = [...table.rows.values()][0];

  assert.deepEqual(
    Object.keys(row).sort(),
    [
      "partitionKey",
      "rowKey",
      "version",
      "count",
      "etag"
    ].sort()
  );
});

type Context = {
  res?: {
    status: number;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  };
};

const settings = {
  FEATURE_PERMANENT_PUBLIC_VISIT: "true",
  FEATURE_PERMANENT_VISITOR_CONSENT_GUARD: "true",
  FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP: "true",
  FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET: "true",
  HOPE_PERMANENT_VISIT_BRIDGE_KEY: "b".repeat(40),
  HOPE_PERMANENT_VISIT_SESSION_SECRET: "s".repeat(40),
  HOPE_PERMANENT_VISIT_CLAIM_SECRET: "c".repeat(40)
};

async function withSettings(
  run: () => Promise<void>
) {
  const previous = new Map<
    string, string | undefined
  >();

  for (const [key, value] of Object.entries(settings)) {
    previous.set(key, process.env[key]);
    process.env[key] = value;
  }

  try {
    await run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

const headers = {
  "content-type": "application/json",
  "x-hope-public-visit-key":
    settings.HOPE_PERMANENT_VISIT_BRIDGE_KEY
};

test("session throttling occurs before calendar or issuance", async () => {
  await withSettings(async () => {
    for (const outcome of [
      "capacity_exhausted",
      "unavailable"
    ] as const) {
      const context: Context = {};

      let budgetCalls = 0;

      await postPermanentPublicVisitSession(
        context,
        { method: "POST", headers, body: {} },
        {
          now: () => now,
          reserveRequest: async (operation, clock) => {
            assert.equal(operation, "session");
            assert.equal(clock, now);
            budgetCalls++;
            return outcome;
          },
          approvedEvents: async () => {
            assert.fail("Calendar must not be reached");
          },
          reserve: async () => {
            assert.fail("Issuance must not be reached");
          }
        }
      );

      assert.equal(budgetCalls, 1);

      assert.equal(
        context.res?.status,
        outcome === "capacity_exhausted" ? 429 : 503
      );

      assert.equal(
        context.res?.body.status,
        "try_later"
      );
    }
  });
});

test("registration throttling occurs before calendar and canonical runtime", async () => {
  await withSettings(async () => {
    for (const outcome of [
      "capacity_exhausted",
      "unavailable"
    ] as const) {
      const context: Context = {};

      let budgetCalls = 0;

      await postPermanentPublicVisitRegistration(
        context,
        {
          method: "POST",
          headers,
          body: {
            token: "synthetic-token",
            submissionId:
              "11111111-1111-4111-8111-111111111111",
            body: {}
          }
        },
        {
          now: () => now,
          reserveRequest: async (operation, clock) => {
            assert.equal(operation, "registration");
            assert.equal(clock, now);
            budgetCalls++;
            return outcome;
          },
          approvedEvents: async () => {
            assert.fail("Calendar must not be reached");
          },
          runtime: async () => {
            assert.fail("Runtime must not be reached");
          }
        }
      );

      assert.equal(budgetCalls, 1);

      assert.equal(
        context.res?.status,
        outcome === "capacity_exhausted" ? 429 : 503
      );

      assert.equal(
        context.res?.body.accepted,
        false
      );
    }
  });
});

test("unauthorized and malformed requests never consume the budget", async () => {
  await withSettings(async () => {
    let calls = 0;

    const reserveRequest = async ():
      Promise<PublicVisitRequestBudgetResult> => {
      calls++;
      return "reserved";
    };

    const unauthorized: Context = {};

    await postPermanentPublicVisitSession(
      unauthorized,
      { method: "POST", headers: {}, body: {} },
      { reserveRequest }
    );

    assert.equal(unauthorized.res?.status, 401);

    const malformed: Context = {};

    await postPermanentPublicVisitSession(
      malformed,
      {
        method: "POST",
        headers,
        body: { unexpected: true }
      },
      { reserveRequest }
    );

    assert.equal(malformed.res?.status, 400);

    const badRegistration: Context = {};

    await postPermanentPublicVisitRegistration(
      badRegistration,
      { method: "POST", headers, body: {} },
      { reserveRequest }
    );

    assert.equal(badRegistration.res?.status, 400);
    assert.equal(calls, 0);
  });
});

test("allowed session requests retain existing calendar and issuance authority", async () => {
  await withSettings(async () => {
    const context: Context = {};
    const operations: string[] = [];

    await postPermanentPublicVisitSession(
      context,
      { method: "POST", headers, body: {} },
      {
        now: () => now,
        reserveRequest: async () => {
          operations.push("request-budget");
          return "reserved";
        },
        approvedEvents: async () => {
          operations.push("calendar");
          return [];
        },
        reserve: async () => {
          operations.push("issuance-budget");
          return "reserved";
        }
      }
    );

    assert.equal(context.res?.status, 200);
    assert.equal(context.res?.body.status, "ready");

    assert.deepEqual(operations, [
      "request-budget",
      "calendar",
      "issuance-budget"
    ]);
  });
});
