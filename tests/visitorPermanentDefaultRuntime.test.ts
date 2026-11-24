import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";

import {
  postPermanentPublicVisitSession as issue
} from "../src/functions/postPermanentPublicVisitSession";

import {
  postPermanentPublicVisitRegistration as submit
} from "../src/functions/postPermanentPublicVisitRegistration";

import {
  SixWeekFollowupEventsRepository
} from "../src/repositories/sixWeekFollowupEventsRepository";

import {
  projectSixWeekVisitorFollowup
} from "../src/domain/followups/projectSixWeekVisitorFollowup";

const enabled =
  process.env.HOPE_VISITOR_72_LOCAL_RUNTIME === "true";

test(
  "actual default runtime issues sessions and records adult and family visits",
  { skip: !enabled },
  async () => {
    const connection =
      process.env.STORAGE_CONNECTION_STRING;

    assert.ok(connection);

    const port =
      process.env.HOPE_VISITOR_72_ISOLATED_PORT;

    assert.ok(port);
    assert.match(port, /^\d+$/);
    assert.notEqual(port, "10002");

    assert.equal(
      process.env.HOPE_TABLE_AUTH_MODE,
      "connection-string"
    );

    assert.equal(
      process.env.AzureWebJobsStorage,
      connection
    );

    const names = [
      "Visitors",
      "VisitorFollowupEvents",
      "PermanentVisitorAdmission",
      "PermanentVisitorSessionQuota"
    ];

    const tables = Object.fromEntries(
      names.map(name => [
        name,
        TableClient.fromConnectionString(
          connection,
          name,
          { allowInsecureConnection: true }
        )
      ])
    );

    // Every table must point to the dedicated local
    // acceptance instance before any test writes.
    for (const table of Object.values(tables)) {
      const endpoint = new URL(table.url);

      assert.equal(endpoint.protocol, "http:");
      assert.equal(endpoint.hostname, "127.0.0.1");
      assert.equal(endpoint.port, port);

      assert.equal(
        endpoint.pathname.replace(/\/$/, ""),
        "/hopevisitor72"
      );
    }

    // Explicit isolated provisioning before requests.
    for (const table of Object.values(tables)) {
      await table.createTable();
    }

    const bridge =
      "synthetic-default-runtime-bridge-secret";

    process.env.FEATURE_PERMANENT_PUBLIC_VISIT =
      "true";
    process.env.FEATURE_PERMANENT_PUBLIC_VISIT_REQUEST_BUDGET =
      "true";

    process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD =
      "true";

    process.env.FEATURE_PERMANENT_VISITOR_AUTOMATIC_FOLLOWUP =
      "true";

    process.env.HOPE_PERMANENT_VISIT_BRIDGE_KEY =
      bridge;

    process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET =
      "synthetic-default-runtime-session-secret";

    process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET =
      "synthetic-default-runtime-claim-secret";

    const headers = {
      "content-type": "application/json",
      "x-hope-public-visit-key": bridge
    };

    // Only clock and calendar are controlled.
    // Storage capacity, reservation, visitor writers,
    // family writer and enrollment use real defaults.
    const deps = {
      now: () =>
        Date.parse("2026-11-24T19:00:00Z"),

      approvedEvents: async () => []
    };

    async function obtainSession() {
      const context: Parameters<typeof issue>[0] = {};

      await issue(context, {
        method: "POST",
        headers,
        body: {}
      }, deps);

      assert.ok(context.res);
      assert.equal(context.res.status, 200);
      assert.equal(context.res.body.status, "ready");

      const token = context.res.body.token;

      assert.equal(typeof token, "string");
      assert.ok(token);

      return token;
    }

    async function register(body: unknown) {
      const context: Parameters<typeof submit>[0] = {};

      await submit(context, {
        method: "POST",
        headers,
        body
      }, deps);

      assert.ok(context.res);

      assert.equal(
        context.res.headers["cache-control"],
        "no-store"
      );

      assert.equal(
        context.res.status,
        200,
        `Unexpected runtime response: ${String(
          context.res.body.status
        )}`
      );

      assert.deepEqual(context.res.body, {
        status: "recorded",
        accepted: true
      });
    }

    const adultSubmission = {
      token: await obtainSession(),
      submissionId: randomUUID(),
      body: {
        name: "Synthetic Runtime Adult",
        email: "runtime-adult@example.invalid",
        phone: "2015550101",
        visitType: "first",
        churchHome: "looking",
        interests: ["prayer"],
        contactConsent: true
      }
    };

    await register(adultSubmission);

    // Retry must not create another profile, visit,
    // reservation or follow-up plan.
    await register(adultSubmission);

    const familySubmission = {
      token: await obtainSession(),
      submissionId: randomUUID(),
      body: {
        name: "Synthetic Runtime Guardian",
        email: "runtime-family@example.invalid",
        phone: "2015550102",
        visitType: "first",
        interests: ["church_events"],
        contactConsent: false,
        family: {
          guardianName:
            "Synthetic Runtime Guardian",

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

    await register(familySubmission);

    const visitors = tables.Visitors;

    const adultReceipt =
      await visitors.getEntity<{
        visitorId: string;
        registrationDetailsJson: string;
      }>(
        "VISITOR_CHECK_IN",
        adultSubmission.submissionId
      );

    const familyReceipt =
      await visitors.getEntity<{
        visitorId: string;
        registrationDetailsJson: string;
      }>(
        "VISITOR_CHECK_IN",
        familySubmission.submissionId
      );

    assert.notEqual(
      adultReceipt.visitorId,
      familyReceipt.visitorId
    );

    assert.equal(
      JSON.parse(
        adultReceipt.registrationDetailsJson
      ).contactConsent,
      true
    );

    assert.equal(
      JSON.parse(
        familyReceipt.registrationDetailsJson
      ).contactConsent,
      false
    );

    async function countRows(
      table: TableClient,
      partition?: string
    ): Promise<number> {
      let count = 0;

      for await (const row of table.listEntities()) {
        if (!partition ||
            row.partitionKey === partition) {
          count++;
        }
      }

      return count;
    }

    assert.equal(
      await countRows(visitors, "VISITOR"),
      2
    );

    assert.equal(
      await countRows(visitors, "VISITOR_CHECK_IN"),
      2
    );

    assert.equal(
      await countRows(
        visitors, "VISITOR_FAMILY_ATTENDANCE"
      ),
      1
    );

    assert.equal(
      await countRows(tables.PermanentVisitorAdmission),
      6
    );

    assert.equal(await countRows(tables.PermanentVisitorSessionQuota), 4);
    const quota = tables.PermanentVisitorSessionQuota;
    const minute = Math.floor(Date.parse("2026-11-24T19:00:00Z") / 60000);
    for (const [operation, count] of [
      ["session", 2], ["registration", 3]
    ] as const) {
      const row = await quota.getEntity(
        `pv-request-v1-${operation}-${minute}`, "budget"
      );
      assert.equal(row.version, 1);
      assert.equal(row.count, count);
    }
    assert.equal(
      await countRows(quota, `pv-session-v1-${minute}`), 2
    );
    console.log("MANDATORY_REQUEST_COUNTERS_VERIFIED=True");

    const followups =
      new SixWeekFollowupEventsRepository();

    const adultEvents =
      await followups.listByVisitor(
        adultReceipt.visitorId
      );

    const familyEvents =
      await followups.listByVisitor(
        familyReceipt.visitorId
      );

    assert.equal(adultEvents.length, 1);
    assert.equal(familyEvents.length, 0);

    const plan =
      projectSixWeekVisitorFollowup(adultEvents);

    assert.ok(plan);
    assert.equal(plan.tasks.length, 6);
    assert.equal(plan.ownerStaffId, null);

    assert.equal(
      await countRows(tables.VisitorFollowupEvents),
      1
    );
  }
);
