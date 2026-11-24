import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  readCanonicalVisitorRegistrationHistory as readRegistrationHistory
} from "../src/services/visitors/readCanonicalVisitorRegistrationHistory";
import {
  getVisitorById, listVisitorsRecords
} from "../src/functions/_shared/visitorsRepository";
import { AzureTableVisitorsRepository } from "../src/repositories/visitorsRepository";
import {
  readSixWeekVisitorFollowup, readSixWeekVisitorFollowupQueue
} from "../src/services/followups/readSixWeekVisitorFollowups";

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

    // Actual canonical read models used by the staff surfaces.
    const directory = await listVisitorsRecords({ limit: 25 });
    assert.equal(directory.items.length, 2);
    assert.equal(new Set(directory.items.map(v => v.visitorId)).size, 2);

    const canonicalRepository = new AzureTableVisitorsRepository();
    for (const [id, expectedName] of [
      [adultReceipt.visitorId, adultSubmission.body.name],
      [familyReceipt.visitorId, familySubmission.body.name]
    ] as const) {
      assert.equal(directory.items.filter(v => v.visitorId === id).length, 1);
      assert.equal((await getVisitorById(id))?.name, expectedName);
      assert.equal((await canonicalRepository.getById(id))?.name, expectedName);
    }

    const asOf = "2026-11-25T19:00:00.000Z";
    const staffPlan = await readSixWeekVisitorFollowup(adultReceipt.visitorId, asOf);
    assert.ok(staffPlan);
    assert.equal(staffPlan.tasks.length, 6);
    assert.equal(staffPlan.ownerStaffId, null);
    assert.equal(await readSixWeekVisitorFollowup(familyReceipt.visitorId, asOf), null);

    const queue = await readSixWeekVisitorFollowupQueue(asOf);
    assert.equal(queue.count, 1);
    assert.equal(queue.needsOwner, 1);
    assert.equal(queue.items[0].visitorId, adultReceipt.visitorId);
    assert.equal(queue.items[0].email, adultSubmission.body.email);
    assert.equal(queue.items[0].plan.tasks.length, 6);

    console.log("CANONICAL_PEOPLE_READS_VERIFIED=True");
    console.log("CONSENTED_SIX_WEEK_READS_VERIFIED=True");
    console.log("DECLINED_FAMILY_NO_PLAN_VERIFIED=True");

    // Exercise the default history reader on receipts produced by
    // the real canonical registration runtime above.
    const adultHistory = await readRegistrationHistory(adultReceipt.visitorId);
    const familyHistory = await readRegistrationHistory(familyReceipt.visitorId);
    assert.equal(adultHistory.status, "ready");
    assert.equal(familyHistory.status, "ready");
    assert.equal(adultHistory.registrationCount, 1);
    assert.equal(familyHistory.registrationCount, 1);
    assert.equal(adultHistory.truncated, false);
    assert.equal(familyHistory.truncated, false);
    assert.equal(adultHistory.items.length, 1);
    assert.equal(familyHistory.items.length, 1);
    assert.equal(adultHistory.items[0].submissionId, adultSubmission.submissionId);
    assert.equal(familyHistory.items[0].submissionId, familySubmission.submissionId);
    assert.equal(adultHistory.items[0].visitType, "first");
    assert.equal(adultHistory.items[0].churchHome, "looking");
    assert.deepEqual(adultHistory.items[0].interests, ["prayer"]);
    assert.equal(adultHistory.items[0].contactConsentAtRegistration, true);
    assert.equal(familyHistory.items[0].contactConsentAtRegistration, false);
    assert.deepEqual(familyHistory.items[0].interests, ["church_events"]);
    assert.deepEqual(familyHistory.items[0].churchHome, null);
    assert.deepEqual(familyHistory.items[0].invitedBy, null);
    for (const history of [adultHistory, familyHistory]) {
      assert.deepEqual(Object.keys(history.items[0]).sort(), [
        "churchHome", "contactConsentAtRegistration", "interests", "invitedBy",
        "recordedAt", "serviceId", "submissionId", "visitType"
      ]);
    }
    assert.deepEqual(await readRegistrationHistory("synthetic-no-history-98"), {
      status: "ready", registrationCount: 0, truncated: false, items: []
    });
    console.log("ACTUAL_REGISTRATION_HISTORY_VERIFIED=True");
    console.log("RETRY_PRESERVES_ONE_HISTORY_ITEM=True");
    console.log("HISTORY_CONTACT_DATA_EXCLUDED=True");
    console.log("CROSS_PERSON_HISTORY_ISOLATION_VERIFIED=True");

    // Deliberate synthetic interruption: a later receipt is durable,
    // but no cancellation event has been written yet.
    const existingReceipt = await visitors.getEntity<{
      recordedAt: string;
      registrationDetailsJson: string;
    }>("VISITOR_CHECK_IN", adultSubmission.submissionId);
    const priorMs = Date.parse(existingReceipt.recordedAt);
    assert.ok(Number.isFinite(priorMs));

    const withdrawal = {
      partitionKey: "VISITOR_CHECK_IN",
      rowKey: randomUUID(),
      visitorId: adultReceipt.visitorId,
      serviceId: adultHistory.items[0].serviceId,
      recordedAt: new Date(priorMs + 1).toISOString(),
      registrationDetailsJson: JSON.stringify({
        ...JSON.parse(existingReceipt.registrationDetailsJson),
        visitType: "returning",
        contactConsent: false
      })
    };
    await visitors.createEntity(withdrawal);

    // Read protection must operate even though the raw plan remains active.
    const raw = projectSixWeekVisitorFollowup(
      await followups.listByVisitor(adultReceipt.visitorId), asOf
    );
    assert.equal(raw?.status, "active");
    await assert.rejects(
      () => readSixWeekVisitorFollowup(adultReceipt.visitorId, asOf),
      /permission withdrawn/
    );
    const suppressed = await readSixWeekVisitorFollowupQueue(asOf);
    assert.equal(suppressed.count, 0);
    assert.equal(suppressed.needsOwner, 0);
    assert.equal(suppressed.items.length, 0);
    assert.deepEqual(await followups.listByVisitor(adultReceipt.visitorId), adultEvents);
    console.log("STALE_ACTIONABLE_PLAN_SUPPRESSED=True");
    const historical = await readRegistrationHistory(adultReceipt.visitorId);
    assert.equal(historical.status, "ready");
    assert.equal(historical.registrationCount, 2);
    assert.equal(historical.items[0].submissionId, withdrawal.rowKey);
    assert.equal(historical.items[0].visitType, "returning");
    assert.equal(historical.items[0].contactConsentAtRegistration, false);
    assert.equal(historical.items[1].submissionId, adultSubmission.submissionId);
    assert.equal(historical.items[1].contactConsentAtRegistration, true);
    assert.deepEqual(await readRegistrationHistory(familyReceipt.visitorId), familyHistory);
    console.log("STORED_HISTORICAL_CONSENT_DECISIONS_PRESERVED=True");

    // Unknown consent must not masquerade as an empty, verified queue.
    await visitors.createEntity({
      ...withdrawal,
      rowKey: randomUUID(),
      recordedAt: new Date(priorMs + 2).toISOString(),
      registrationDetailsJson: "invalid-synthetic-json"
    });
    await assert.rejects(
      () => readSixWeekVisitorFollowup(adultReceipt.visitorId, asOf),
      /consent could not be verified/
    );
    await assert.rejects(
      () => readSixWeekVisitorFollowupQueue(asOf),
      /consent could not be verified/
    );
    assert.deepEqual(await followups.listByVisitor(adultReceipt.visitorId), adultEvents);
    console.log("UNKNOWN_CONSENT_READS_FAIL_CLOSED=True");
    assert.deepEqual(await readRegistrationHistory(adultReceipt.visitorId), {
      status: "unavailable"
    });
    assert.deepEqual(await readRegistrationHistory(familyReceipt.visitorId), familyHistory);
    console.log("MALFORMED_STORED_HISTORY_FAILS_CLOSED=True");
    console.log("FOLLOWUP_EVENT_HISTORY_UNCHANGED=True");

    const noEvidenceId = "synthetic-no-registration-evidence";
    const legacyEvents = adultEvents.map(event => ({
      ...event,
      visitorId: noEvidenceId,
      actorId: "synthetic-staff"
    }));
    const legacyRepo = {
      listByVisitor: async () => legacyEvents,
      listAll: async () => legacyEvents
    };
    const legacyPlan = await readSixWeekVisitorFollowup(noEvidenceId, asOf, {
      repository: legacyRepo
    });
    assert.equal(legacyPlan?.status, "active");

    const missingEvidenceEvents = adultEvents.map(event => ({
      ...event,
      visitorId: noEvidenceId
    }));
    await assert.rejects(
      () => readSixWeekVisitorFollowup(noEvidenceId, asOf, {
        repository: {
          listByVisitor: async () => missingEvidenceEvents,
          listAll: async () => missingEvidenceEvents
        }
      }),
      /consent could not be verified/
    );
    console.log("LEGACY_PLAN_READ_COMPATIBILITY_VERIFIED=True");
    console.log("PUBLIC_PLAN_WITHOUT_CONSENT_EVIDENCE_DENIED=True");
  }
);
