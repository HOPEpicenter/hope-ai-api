import { test } from "node:test";
import { strict as assert } from "node:assert";
import { randomUUID } from "node:crypto";
import { TableClient } from "@azure/data-tables";
import {
  readCanonicalVisitorRegistrationHistory as readRegistrationHistory
} from "../src/services/visitors/readCanonicalVisitorRegistrationHistory";
import { createHash as familyHistoryHash } from "node:crypto";
import {
  readCanonicalVisitorRegistrationFamilyHistory as readFamilyHistory
} from "../src/services/visitors/readCanonicalVisitorRegistrationFamilyHistory";
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
    // Use the actual default consent reader and isolated communication ledger.
    // Staff identity is synthetic; denied formation writes are tripwires.
    process.env.HOPE_API_KEY = "synthetic-step106-staff-key";
    const commandKey = process.env.HOPE_API_KEY;
    const commandActorId = "synthetic-step106-staff";
    const commandActor = { staffId: commandActorId, status: "active" as const, roleLabel: "Pastor" };
    const contactGuard = (await import("../src/services/followups/requireCurrentRegistrationContactPermission")).requireCurrentRegistrationContactPermission;
    const communication = await import("../src/services/communications/ministryCommunicationCommands");
    const { MinistryCommunicationEventsRepository } = await import("../src/repositories/ministryCommunicationEventsRepository");
    const { postCareCandidateAssign } = await import("../src/functions/postCareCandidateAssign");
    const { postCareCandidateAssignBulk } = await import("../src/functions/postCareCandidateAssignBulk");
    const { postFormationEvent } = await import("../src/functions/postFormationEvent");
    const { postEngagementEvent } = await import("../src/functions/postEngagementEvent");
    const { startSixWeekVisitorFollowup } = await import("../src/services/followups/sixWeekVisitorFollowupCommands");
    const ledger = new MinistryCommunicationEventsRepository();
    let commandClock = Date.parse("2026-11-24T19:00:00.000Z");
    const communicationDeps = {
      readActor: async () => commandActor,
      now: () => new Date(++commandClock).toISOString()
    };
    const intentFor = (visitorId: string, communicationId = "synthetic-step106-intent") => ({
      visitorId, communicationId, actorId: commandActorId,
      channel: "email" as const, intent: "follow_up" as const,
      context: "person_360" as const
    });
    const preferenceFor = (visitorId: string) => ({
      visitorId, actorId: commandActorId, channel: "email" as const, state: "granted" as const
    });
    const stopWrite = (): never => { throw new Error("Unexpected denied command dependency access"); };
    const ctxFor = (): any => ({ res: undefined, log: Object.assign(() => {}, { error: () => {}, warn: () => {}, info: () => {} }) });
    type SingleDeps = import("../src/functions/postCareCandidateAssign").CareAssignConsentDependencies;
    const careAuth = {
      requireActor: (async () => ({ ok: true, actor: commandActor })) as unknown as NonNullable<SingleDeps["requireActor"]>,
      requireAssignee: (async () => ({ ok: true, actor: commandActor, assignee: commandActor })) as unknown as NonNullable<SingleDeps["requireAssignee"]>
    };
    const authorizeActor: NonNullable<import("../src/functions/postFormationEvent").FormationEventConsentDependencies["authorizeActor"]> =
      async () => ({ ok: true, actorId: commandActorId });
    const commandHeaders = { "x-api-key": commandKey, "x-hope-staff-actor-id": commandActorId };
    async function assertDeniedCommands(visitorId: string, status: 409 | 503, mixedVisitorId: string) {
      const before = await ledger.listByVisitor(visitorId);
      const guardFailure = await contactGuard(visitorId);
      assert.equal(guardFailure?.status, status);
      for (const result of [
        await communication.recordMinistryCommunicationIntent(intentFor(visitorId), communicationDeps),
        await communication.recordMinistryCommunicationIntent(intentFor(visitorId, "synthetic-new-denied-intent"), communicationDeps),
        await communication.recordMinistryCommunicationPreference(preferenceFor(visitorId), communicationDeps)
      ]) {
        assert.equal(result.accepted, false);
        assert.equal(result.status, status);
      }
      assert.deepEqual(await ledger.listByVisitor(visitorId), before);
      const single = ctxFor();
      await postCareCandidateAssign(single, { headers: commandHeaders, params: { visitorId }, body: { assignedTo: commandActorId } }, {
        ...careAuth, getVisitor: async () => stopWrite()
      });
      assert.equal(single.res.status, status);
      const bulk = ctxFor();
      await postCareCandidateAssignBulk(bulk, { headers: commandHeaders, body: { assignedTo: commandActorId, visitorIds: [mixedVisitorId, visitorId] } }, {
        ...careAuth, getTable: () => stopWrite(), getVisitor: async () => stopWrite(), upsertProfile: async () => stopWrite()
      });
      assert.equal(bulk.res.status, status);
      for (const type of ["FOLLOWUP_ASSIGNED", "FOLLOWUP_CONTACTED", "NEXT_STEP_SELECTED", "FOLLOWUP_OUTCOME_RECORDED"]) {
        const req = { headers: commandHeaders, body: { v: 1, eventId: randomUUID(), visitorId, type, occurredAt: "2026-11-24T00:00:00.000Z", source: { system: "hope-dashboard-next", actorId: commandActorId }, data: {} } };
        const formation = ctxFor();
        await postFormationEvent(formation, req, { authorizeActor, ensureTables: async () => stopWrite(), recordFormation: async () => stopWrite() });
        assert.equal(formation.res.status, status);
        const engagement = ctxFor();
        await postEngagementEvent(engagement, req, { authorizeActor, appendEngagement: async () => stopWrite(), recordFormation: async () => stopWrite() });
        assert.equal(engagement.res.status, status);
      }
      const previousPlans = await followups.listByVisitor(visitorId);
      const start = await startSixWeekVisitorFollowup({ visitorId, actorId: commandActorId, firstVisitDate: "2026-11-24", contactConsent: true }, {
        readActor: async () => commandActor,
        repository: followups
      });
      assert.equal(start.accepted, false);
      assert.equal(start.status, status);
      assert.deepEqual(await followups.listByVisitor(visitorId), previousPlans);
    }
    assert.equal(await contactGuard(adultReceipt.visitorId), null);
    // Registration grant is not a substitute for channel-specific permission.
    const noChannel = await communication.recordMinistryCommunicationIntent(intentFor(adultReceipt.visitorId), communicationDeps);
    assert.equal(noChannel.accepted, false);
    assert.equal(noChannel.status, 409);
    assert.equal((await ledger.listByVisitor(adultReceipt.visitorId)).length, 0);
    const channelGrant = await communication.recordMinistryCommunicationPreference(preferenceFor(adultReceipt.visitorId), communicationDeps);
    assert.equal(channelGrant.accepted, true);
    const intentGrant = await communication.recordMinistryCommunicationIntent(intentFor(adultReceipt.visitorId), communicationDeps);
    assert.equal(intentGrant.accepted, true);
    assert.equal((await ledger.listByVisitor(adultReceipt.visitorId)).length, 2);
    assert.equal((await ledger.listByVisitor(familyReceipt.visitorId)).length, 0);
    console.log("ACTUAL_GRANTED_RECEIPT_AND_CHANNEL_LEDGER_VERIFIED=True");
    await assertDeniedCommands(familyReceipt.visitorId, 409, adultReceipt.visitorId);
    assert.equal((await ledger.listByVisitor(familyReceipt.visitorId)).length, 0);
    console.log("ACTUAL_DECLINED_FAMILY_COMMANDS_DENIED=True");
    const { mayExposeRegistrationContactWork } = await import("../src/services/followups/mayExposeRegistrationContactWork");
    const { readCanonicalCareProjection } = await import("../src/services/care/readCanonicalCareProjection");
    const { buildOpsFollowupsQueue } = await import("../src/services/followups/buildOpsFollowupsQueue");
    const queueProfile = (visitorId: string): import("../src/functions/_shared/formation").FunctionFormationProfileEntity => ({
      partitionKey: "VISITOR", rowKey: visitorId, visitorId,
      assignedTo: commandActorId, lastFollowupAssignedAt: "2026-11-23T19:00:00.000Z"
    });
    const queueRows = (ids: string[]) => ids.map(visitorId => ({
      partitionKey: visitorId, visitorId, type: "FOLLOWUP_ASSIGNED",
      occurredAt: "2026-11-23T19:00:00.000Z", assigneeId: commandActorId
    }));
    const tableFor = (rows: object[]) => ({
      async *listEntities() { for (const row of rows) yield row; }
    }) as unknown as import("@azure/data-tables").TableClient;
    const opsQueue = (ids: string[], includeResolved = false, extra: object[] = []) => buildOpsFollowupsQueue({
      eventsTable: tableFor([...queueRows(ids), ...extra]), profilesTable: tableFor([]),
      engagementService: {} as import("../src/services/engagements/engagementsService").EngagementsService,
      limit: 10, cursor: 0, includeSynthetic: true, includeResolved, enrichmentMode: "task-preview"
    });
    const careQueue = (ids: string[]) => readCanonicalCareProjection({
      profiles: ids.map(queueProfile),
      readDashboardCard: async () => { throw new Error("Unexpected care card read"); }
    });
    assert.equal(await mayExposeRegistrationContactWork(adultReceipt.visitorId), true);
    assert.equal(await mayExposeRegistrationContactWork(familyReceipt.visitorId), false);
    const initialCare = await careQueue([familyReceipt.visitorId]);
    assert.equal(initialCare.items.length, 0);
    assert.equal(initialCare.summary.totalCandidates, 0);
    await assert.rejects(() => careQueue([adultReceipt.visitorId]), /Unexpected care card read/);
    const initialOps = await opsQueue([adultReceipt.visitorId, familyReceipt.visitorId]);
    assert.deepEqual(initialOps.items.map(item => item.visitorId), [adultReceipt.visitorId]);
    assert.equal(initialOps.stats.total, 1);
    assert.equal(initialOps.owners[0]?.total, 1);
    console.log("ACTUAL_CARE_AND_OPS_DECLINE_EXCLUDED=True");
    console.log("MIXED_CONSENT_PREFLIGHT_DENIED_BEFORE_FORMATION_ACCESS=True");
    {
      const individual = await readFamilyHistory(adultReceipt.visitorId);
      const family = await readFamilyHistory(familyReceipt.visitorId);
      assert.equal(individual.status, "ready", "Individual family absence query failed");
      assert.equal(family.status, "ready", "Linked family evidence query failed");
      assert.equal(individual.registrationCount, 1);
      assert.equal(family.registrationCount, 1);
      assert.deepEqual(individual.items[0].familyAttendance, { status: "not_confirmed" });
      const attendance = family.items[0].familyAttendance;
      assert.equal(attendance.status, "recorded");
      assert.equal(attendance.childCount, 1);
      assert.deepEqual(attendance.children, [{ firstName: "Synthetic Child", ageGroup: "6-11" }]);
      assert.equal(attendance.purpose, "general_church_attendance");
      assert.equal(attendance.relationshipStatus, "guardian_declared_unverified");
      assert.equal(family.items[0].submissionId, familySubmission.submissionId);
      assert.equal(family.items[0].contactConsentAtRegistration, false);
      assert.deepEqual(Object.keys(attendance).sort(), [
        "childCount", "children", "purpose", "recordedAt", "relationshipStatus", "status"
      ]);
      assert.deepEqual(await readFamilyHistory("synthetic-no-history-99"), {
        status: "ready", registrationCount: 0, truncated: false, items: []
      });
      console.log("ACTUAL_LINKED_FAMILY_HISTORY_VERIFIED=True");
      console.log("MISSING_FAMILY_NOT_INFERRED_INDIVIDUAL=True");
      console.log("FAMILY_HISTORY_MINIMAL_CONTRACT_VERIFIED=True");
      const failedFamilyQuery = {
        listEntities<T extends object>(options?: Parameters<TableClient["listEntities"]>[0]) {
          if (options?.queryOptions?.filter?.includes("VISITOR_FAMILY_ATTENDANCE")) {
            throw new Error("Synthetic family query failure");
          }
          return visitors.listEntities<T>(options);
        }
      } satisfies Pick<TableClient, "listEntities">;
      assert.deepEqual(await readFamilyHistory(adultReceipt.visitorId, failedFamilyQuery), {
        status: "unavailable"
      });
      console.log("FAMILY_QUERY_FAILURE_NOT_TREATED_AS_ABSENCE=True");

      const identity = [familySubmission.submissionId, family.items[0].serviceId, familyReceipt.visitorId];
      const digest = (value: unknown) => familyHistoryHash("sha256")
        .update(JSON.stringify(value)).digest("hex");
      const partitionKey = "VISITOR_FAMILY_ATTENDANCE";
      const rowKey = "family-attendance-" + digest(identity).slice(0, 32);
      const original = await visitors.getEntity<{
        fingerprint: string; childrenJson: string; adultVisitorId: string;
      }>(partitionKey, rowKey);
      async function change(fields: Record<string, string>) {
        const row = await visitors.getEntity(partitionKey, rowKey);
        await visitors.updateEntity({ ...fields, partitionKey, rowKey }, "Merge", { etag: row.etag });
      }
      try {
        await change({ adultVisitorId: adultReceipt.visitorId });
        assert.deepEqual(await readFamilyHistory(familyReceipt.visitorId), { status: "unavailable" });
        assert.deepEqual(await readFamilyHistory(adultReceipt.visitorId), individual);
        await change({ adultVisitorId: original.adultVisitorId, fingerprint: "0".repeat(64) });
        assert.deepEqual(await readFamilyHistory(familyReceipt.visitorId), { status: "unavailable" });
        const invalidChildren = JSON.stringify([{ firstName: "Synthetic Child", ageGroup: "unknown" }]);
        await change({
          childrenJson: invalidChildren,
          fingerprint: digest([...identity, "general_church_attendance", "guardian_declared_unverified", invalidChildren])
        });
        assert.deepEqual(await readFamilyHistory(familyReceipt.visitorId), { status: "unavailable" });
      } finally {
        await change({ adultVisitorId: original.adultVisitorId, childrenJson: original.childrenJson,
          fingerprint: original.fingerprint });
      }
      assert.deepEqual(await readFamilyHistory(familyReceipt.visitorId), family);
      console.log("CROSS_PERSON_FAMILY_EVIDENCE_DENIED=True");
      console.log("FAMILY_FINGERPRINT_MISMATCH_DENIED=True");
      console.log("MALFORMED_CHILD_EVIDENCE_DENIED=True");
      console.log("ORIGINAL_SYNTHETIC_FAMILY_EVIDENCE_RESTORED=True");
    }

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
    await assertDeniedCommands(adultReceipt.visitorId, 409, familyReceipt.visitorId);
    assert.equal((await ledger.listByVisitor(adultReceipt.visitorId)).length, 2);
    const cancelled = await communication.cancelMinistryCommunication({ visitorId: adultReceipt.visitorId, actorId: commandActorId, communicationId: "synthetic-step106-intent", reason: "Synthetic permission withdrawn" }, communicationDeps);
    assert.equal(cancelled.accepted, true);
    assert.equal((await ledger.listByVisitor(adultReceipt.visitorId)).length, 3);
    console.log("ACTUAL_WITHDRAWAL_BLOCKS_NEW_AND_REPLAYED_COMMANDS=True");
    assert.equal(await mayExposeRegistrationContactWork(adultReceipt.visitorId), false);
    const withdrawnCare = await careQueue([adultReceipt.visitorId, familyReceipt.visitorId]);
    assert.equal(withdrawnCare.items.length, 0);
    assert.equal(withdrawnCare.summary.totalCandidates, 0);
    const withdrawnOps = await opsQueue([adultReceipt.visitorId, familyReceipt.visitorId]);
    assert.equal(withdrawnOps.items.length, 0);
    assert.equal(withdrawnOps.stats.total, 0);
    assert.equal(withdrawnOps.owners.length, 0);
    const resolvedOps = await opsQueue([adultReceipt.visitorId], true, [{
      partitionKey: adultReceipt.visitorId, visitorId: adultReceipt.visitorId,
      type: "FOLLOWUP_OUTCOME_RECORDED", occurredAt: "2026-11-24T00:00:00.000Z",
      metadata: { outcome: "closed" }
    }]);
    assert.equal(resolvedOps.items.length, 1);
    assert.equal(resolvedOps.items[0].followupResolved, true);
    console.log("ACTUAL_WITHDRAWAL_REMOVED_FROM_QUEUE_COUNTS=True");
    console.log("RESOLVED_OPERATIONAL_HISTORY_PRESERVED=True");
    console.log("ACTUAL_LEDGER_CANCELLATION_PRESERVED=True");
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
    // The malformed adult receipt is newer than the withdrawal. Put it first
    // in bulk preflight so a known family decline cannot mask unavailable state.
    await assertDeniedCommands(adultReceipt.visitorId, 503, adultReceipt.visitorId);
    assert.equal((await ledger.listByVisitor(adultReceipt.visitorId)).length, 3);
    assert.equal((await ledger.listByVisitor(familyReceipt.visitorId)).length, 0);
    console.log("ACTUAL_MALFORMED_CONSENT_COMMANDS_FAIL_CLOSED=True");
    await assert.rejects(() => careQueue([adultReceipt.visitorId]), /consent could not be verified/);
    await assert.rejects(() => opsQueue([adultReceipt.visitorId]), /consent could not be verified/);
    assert.equal(await mayExposeRegistrationContactWork("synthetic-legacy-107"), true);
    const savedQueueFlag = process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD;
    try {
      process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = "false";
      assert.equal(await mayExposeRegistrationContactWork(adultReceipt.visitorId), true);
    } finally {
      if (savedQueueFlag === undefined) delete process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD;
      else process.env.FEATURE_PERMANENT_VISITOR_CONSENT_GUARD = savedQueueFlag;
    }
    console.log("ACTUAL_UNKNOWN_QUEUE_CONSENT_FAILS_CLOSED=True");
    console.log("QUEUE_LEGACY_AND_DISABLED_COMPATIBILITY_VERIFIED=True");
    console.log("DENIED_COMMANDS_PRESERVE_LEDGER_AND_PLAN_HISTORY=True");
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
    const { createPermanentVisitRecoveryJournal } = await import("../src/services/visitors/permanentVisitRecoveryJournal");
    const recoveryJournal109 = createPermanentVisitRecoveryJournal(visitors);
    const adultRecovery109 = await recoveryJournal109.inspect(adultSubmission.submissionId);
    const familyRecovery109 = await recoveryJournal109.inspect(familySubmission.submissionId);
    assert.equal(adultRecovery109.status, "completed");
    assert.equal(familyRecovery109.status, "completed");
    if (adultRecovery109.status !== "completed" || familyRecovery109.status !== "completed") throw new Error("Missing completed journal");
    assert.equal(adultRecovery109.intent.familyExpected, false);
    assert.equal(familyRecovery109.intent.familyExpected, true);
    assert.equal(familyRecovery109.intent.followupExpected, true);
    assert.equal(await countRows(visitors, "PUBLIC_VISIT_RECOVERY_INTENT"), 2);
    assert.equal(await countRows(visitors, "PUBLIC_VISIT_RECOVERY_COMPLETE"), 2);
    console.log("DEFAULT_RUNTIME_DURABLE_JOURNAL_VERIFIED=True");

    const { submitPermanentPublicVisitRegistration } = await import("../src/services/visitors/submitPermanentPublicVisitRegistration");
    const { createPermanentVisitorQrReservationStore } = await import("../src/repositories/permanentVisitorQrReservationStore");
    const { recordVisitorFamilyCheckIn } = await import("../src/services/visitors/recordVisitorFamilyCheckIn");
    const interrupted109 = {
      token: await obtainSession(), submissionId: randomUUID(),
      body: {
        ...familySubmission.body, name: "Synthetic Recovery Guardian",
        email: "recovery-109@example.invalid", phone: "2015550109",
        family: { ...familySubmission.body.family, guardianName: "Synthetic Recovery Guardian" }
      }
    };
    const recoveryDeps109 = {
      enabled: true, familyEnabled: true, automaticFollowupEnabled: true,
      context: { enabled: true, nowMs: deps.now(), approvedEvents: [] },
      store: createPermanentVisitorQrReservationStore(tables.PermanentVisitorAdmission),
      signingSecret: process.env.HOPE_PERMANENT_VISIT_SESSION_SECRET!,
      claimSecret: process.env.HOPE_PERMANENT_VISIT_CLAIM_SECRET!,
      recoveryJournal: recoveryJournal109,
      enrollFollowup: async (): Promise<never> => { throw new Error("Synthetic enrollment interruption"); }
    };
    const beforeAdult109 = await countRows(visitors, "VISITOR_CHECK_IN");
    const beforeFamily109 = await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE");
    const beforeProfiles109 = await countRows(visitors, "VISITOR");
    const first109 = await submitPermanentPublicVisitRegistration(interrupted109, {
      ...recoveryDeps109,
      recordFamily: command => recordVisitorFamilyCheckIn(command, {
        saveFamily: async () => { throw new Error("Synthetic family interruption"); }
      })
    });
    assert.deepEqual(first109, { accepted: false, status: "try_later" });
    assert.equal(await countRows(visitors, "VISITOR_CHECK_IN"), beforeAdult109 + 1);
    assert.equal(await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE"), beforeFamily109);
    const pending109 = await recoveryJournal109.inspect(interrupted109.submissionId);
    if (pending109.status !== "pending") throw new Error("Incomplete family must remain pending");
    assert.equal(pending109.intent.familyExpected, true);
    const { inspectPermanentVisitRecovery } = await import("../src/services/visitors/inspectPermanentVisitRecovery");
    const readOnly110 = { listEntities: visitors.listEntities.bind(visitors) };
    assert.deepEqual(await inspectPermanentVisitRecovery(interrupted109.submissionId, readOnly110), {
      status: "ready", ...pending109.intent, stage: "family_attendance_unconfirmed",
      adultRecorded: true, familyRecorded: false
    });
    console.log("ACTUAL_INTERRUPTED_FAMILY_STAGE_VERIFIED=True");
    console.log("INTERRUPTED_FAMILY_DURABLY_IDENTIFIED=True");
    const second109 = await submitPermanentPublicVisitRegistration(interrupted109, {
      ...recoveryDeps109, recordFamily: recordVisitorFamilyCheckIn
    });
    assert.deepEqual(second109, { accepted: false, status: "try_later" });
    assert.equal(await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE"), beforeFamily109 + 1);
    assert.equal((await recoveryJournal109.inspect(interrupted109.submissionId)).status, "pending");
    assert.deepEqual(await inspectPermanentVisitRecovery(interrupted109.submissionId, readOnly110), {
      status: "ready", ...pending109.intent, stage: "completion_unconfirmed",
      adultRecorded: true, familyRecorded: true
    });
    console.log("ACTUAL_COMPLETION_UNCONFIRMED_STAGE_VERIFIED=True");
    console.log("INTERRUPTED_ENROLLMENT_REMAINS_PENDING=True");
    await register(interrupted109);
    assert.equal((await recoveryJournal109.inspect(interrupted109.submissionId)).status, "completed");
    assert.equal(await countRows(visitors, "VISITOR_CHECK_IN"), beforeAdult109 + 1);
    assert.equal(await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE"), beforeFamily109 + 1);
    assert.equal(await countRows(visitors, "VISITOR"), beforeProfiles109 + 1);
    assert.equal(await countRows(visitors, "PUBLIC_VISIT_RECOVERY_INTENT"), 3);
    assert.equal(await countRows(visitors, "PUBLIC_VISIT_RECOVERY_COMPLETE"), 3);
    console.log("EXACT_RETRY_COMPLETES_JOURNAL_WITHOUT_DUPLICATES=True");
    assert.equal(await recoveryJournal109.begin({ ...pending109.intent, familyExpected: false }), false);
    assert.equal(await recoveryJournal109.complete({ ...pending109.intent, submissionId: randomUUID() }), false);
    assert.equal((await recoveryJournal109.inspect(randomUUID())).status, "not_tracked");
    for (const partition of ["PUBLIC_VISIT_RECOVERY_INTENT", "PUBLIC_VISIT_RECOVERY_COMPLETE"]) {
      for await (const row of visitors.listEntities({ queryOptions: { filter: `PartitionKey eq '${partition}'` } })) {
        const allowed = new Set(["partitionKey", "rowKey", "version", "recordedAt", "submissionId", "serviceId", "visitDate", "familyExpected", "followupExpected", "etag", "timestamp"]);
        assert.ok(Object.keys(row).every(key => allowed.has(key)));
      }
    }
    console.log("JOURNAL_MINIMAL_AND_CONFLICT_SAFE=True");
    assert.deepEqual(await inspectPermanentVisitRecovery(interrupted109.submissionId, readOnly110), {
      status: "ready", ...pending109.intent, stage: "completed",
      adultRecorded: true, familyRecorded: true
    });
    assert.deepEqual(await inspectPermanentVisitRecovery(familySubmission.submissionId, readOnly110), {
      status: "ready", ...familyRecovery109.intent, stage: "completed",
      adultRecorded: true, familyRecorded: true
    });
    console.log("ACTUAL_COMPLETED_RECOVERY_INSPECTION_VERIFIED=True");
    const orphan110 = { ...pending109.intent, submissionId: randomUUID() };
    assert.equal(await recoveryJournal109.begin(orphan110), true);
    assert.deepEqual(await inspectPermanentVisitRecovery(orphan110.submissionId, readOnly110), {
      status: "ready", ...orphan110, stage: "awaiting_arrival_claim",
      adultRecorded: false, familyRecorded: false
    });
    await visitors.createEntity({ partitionKey: "VISITOR_CHECK_IN_CLAIM", rowKey: orphan110.submissionId,
      visitorId: randomUUID(), fingerprint: "a".repeat(64), createProfile: true,
      claimedAt: new Date().toISOString() });
    assert.deepEqual(await inspectPermanentVisitRecovery(orphan110.submissionId, readOnly110), {
      status: "ready", ...orphan110, stage: "adult_attendance_unconfirmed",
      adultRecorded: false, familyRecorded: false
    });
    console.log("PRE_ATTENDANCE_RECOVERY_STAGES_VERIFIED=True");
    assert.equal(await recoveryJournal109.complete(orphan110), true);
    assert.deepEqual(await inspectPermanentVisitRecovery(orphan110.submissionId, readOnly110), { status: "unavailable" });
    assert.deepEqual(await inspectPermanentVisitRecovery(randomUUID(), readOnly110), { status: "not_tracked" });
    assert.deepEqual(await inspectPermanentVisitRecovery("invalid", readOnly110), { status: "unavailable" });
    const failedRead110 = { listEntities: (() => { throw new Error("Synthetic read outage"); }) as typeof visitors.listEntities };
    assert.deepEqual(await inspectPermanentVisitRecovery(interrupted109.submissionId, failedRead110), { status: "unavailable" });
    const originalClaim110 = await visitors.getEntity<{ fingerprint: string }>("VISITOR_CHECK_IN_CLAIM", interrupted109.submissionId);
    try {
      await visitors.updateEntity({ partitionKey: "VISITOR_CHECK_IN_CLAIM", rowKey: interrupted109.submissionId, fingerprint: "0".repeat(64) }, "Merge");
      assert.deepEqual(await inspectPermanentVisitRecovery(interrupted109.submissionId, readOnly110), { status: "unavailable" });
    } finally {
      await visitors.updateEntity({ partitionKey: "VISITOR_CHECK_IN_CLAIM", rowKey: interrupted109.submissionId, fingerprint: originalClaim110.fingerprint }, "Merge");
    }
    console.log("INCONSISTENT_AND_UNAVAILABLE_RECOVERY_EVIDENCE_DENIED=True");
    assert.equal(await countRows(visitors, "VISITOR_CHECK_IN"), beforeAdult109 + 1);
    assert.equal(await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE"), beforeFamily109 + 1);
    assert.equal(await countRows(visitors, "VISITOR"), beforeProfiles109 + 1);
    const { discoverPermanentVisitRecovery } = await import("../src/services/visitors/discoverPermanentVisitRecovery");
    const date113 = pending109.intent.visitDate;
    const pending113 = { ...pending109.intent, submissionId: randomUUID() };
    const other113 = { ...pending113, submissionId: randomUUID(), visitDate: "2026-11-23" };
    assert.notEqual(other113.visitDate, date113);
    assert.equal(await recoveryJournal109.begin(pending113), true);
    assert.equal(await recoveryJournal109.begin(other113), true);
    const found113: string[] = [];
    let cursor113: string | undefined;
    let total113 = 0;
    let pages113 = 0;
    do {
      const page113 = await discoverPermanentVisitRecovery({ visitDate: date113, cursor: cursor113, limit: 1 }, readOnly110);
      if (page113.status !== "ready") throw new Error("Expected discovery page");
      assert.equal(page113.scanned, 1);
      assert.equal(page113.visitDate, date113);
      total113 += page113.scanned;
      for (const entry of page113.items) {
        found113.push(entry.submissionId);
        if (entry.submissionId === pending113.submissionId) {
          assert.deepEqual(entry, { status: "ready", ...pending113, stage: "awaiting_arrival_claim", adultRecorded: false, familyRecorded: false });
        } else {
          assert.deepEqual(entry, { status: "unavailable", submissionId: orphan110.submissionId });
        }
      }
      if (page113.nextCursor !== null) assert.ok(page113.nextCursor > (cursor113 ?? ""));
      cursor113 = page113.nextCursor ?? undefined;
      if (++pages113 > 10) throw new Error("Discovery cursor did not advance");
    } while (cursor113 !== undefined);
    assert.equal(total113, 5);
    assert.equal(pages113, 5);
    assert.deepEqual(found113.sort(), [pending113.submissionId, orphan110.submissionId].sort());
    console.log("ACTUAL_RECOVERY_DISCOVERY_PAGINATION_VERIFIED=True");
    console.log("COMPLETED_EXCLUDED_AND_INCONSISTENT_RETAINED=True");
    const otherPage113 = await discoverPermanentVisitRecovery({ visitDate: other113.visitDate }, readOnly110);
    assert.deepEqual(otherPage113, { status: "ready", visitDate: other113.visitDate, scanned: 1,
      items: [{ status: "ready", ...other113, stage: "awaiting_arrival_claim", adultRecorded: false, familyRecorded: false }], nextCursor: null });
    assert.deepEqual(await discoverPermanentVisitRecovery({ visitDate: "2026-02-30" }, failedRead110), { status: "invalid" });
    assert.deepEqual(await discoverPermanentVisitRecovery({ visitDate: date113, cursor: "'" }, failedRead110), { status: "invalid" });
    assert.deepEqual(await discoverPermanentVisitRecovery({ visitDate: date113, limit: 21 }, failedRead110), { status: "invalid" });
    assert.deepEqual(await discoverPermanentVisitRecovery({ visitDate: date113 }, failedRead110), { status: "unavailable" });
    console.log("DISCOVERY_DATE_ISOLATION_AND_FAILURE_BOUNDARY_VERIFIED=True");
    assert.equal(await countRows(visitors, "VISITOR_CHECK_IN"), beforeAdult109 + 1);
    assert.equal(await countRows(visitors, "VISITOR_FAMILY_ATTENDANCE"), beforeFamily109 + 1);
    assert.equal(await countRows(visitors, "VISITOR"), beforeProfiles109 + 1);
    console.log("READ_ONLY_RECOVERY_DISCOVERY_VERIFIED=True");
    console.log("READ_ONLY_RECOVERY_INSPECTION_VERIFIED=True");
    const { inspectPermanentVisitIdentityReservation } = await import("../src/services/visitors/inspectPermanentVisitIdentityReservation");
    const { recordVisitorArrival: arrival116 } = await import("../src/services/visitors/recordVisitorArrival");
    const { createVisitorFromCheckIn: create116 } = await import("../src/functions/_shared/visitorsRepository");
    const stopBeforeProfile116 = new Proxy(visitors, {
      get(target, property) {
        if (property === "createEntity") return async (entity: { partitionKey: string; rowKey: string }) => {
          if (entity.partitionKey === "VISITOR") throw new Error("Synthetic profile interruption");
          return target.createEntity(entity);
        };
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const profiles116 = await countRows(visitors, "VISITOR");
    const receipts116 = await countRows(visitors, "VISITOR_CHECK_IN");
    for (const dual of [false, true]) {
      const suffix = dual ? "dual" : "single";
      const email = `recovery-116-${suffix}@example.invalid`;
      const phone = dual ? "2015550116" : "";
      const request116 = { token: await obtainSession(), submissionId: randomUUID(), body: {
        ...adultSubmission.body, name: `Synthetic Identity Recovery ${suffix}`, email, phone, contactConsent: false
      } };
      const pending116 = await submitPermanentPublicVisitRegistration(request116, {
        ...recoveryDeps109,
        recordAdult: command => arrival116(command, { createProfile: (_table, input) => create116(stopBeforeProfile116, input) })
      });
      assert.deepEqual(pending116, { accepted: false, status: "try_later" });
      const claim116 = await visitors.getEntity<{ visitorId: string }>("VISITOR_CHECK_IN_CLAIM", request116.submissionId);
      const emailIndex116 = await visitors.getEntity<{ visitorId: string }>("EMAIL", encodeURIComponent(email));
      assert.equal(emailIndex116.visitorId, claim116.visitorId);
      if (dual) {
        const phoneIndex116 = await visitors.getEntity<{ visitorId: string }>("PHONE", phone);
        assert.equal(phoneIndex116.visitorId, claim116.visitorId);
      }
      await assert.rejects(visitors.getEntity("VISITOR", claim116.visitorId), { statusCode: 404 });
      assert.deepEqual(await inspectPermanentVisitIdentityReservation(request116.submissionId, readOnly110), {
        status: "ready", stage: "reservation_without_profile", emailReservationObserved: true, phoneReservationObserved: dual
      });
      const competitor116 = { ...request116, token: await obtainSession(), submissionId: randomUUID() };
      assert.deepEqual(await submitPermanentPublicVisitRegistration(competitor116, {
        ...recoveryDeps109, recordAdult: arrival116
      }), { accepted: false, status: "requires_staff_review" });
      const competingClaim116 = await visitors.getEntity<{ visitorId: string }>("VISITOR_CHECK_IN_CLAIM", competitor116.submissionId);
      assert.notEqual(competingClaim116.visitorId, claim116.visitorId);
      assert.equal((await visitors.getEntity<{ visitorId: string }>("EMAIL", encodeURIComponent(email))).visitorId, claim116.visitorId);
      assert.deepEqual(await inspectPermanentVisitIdentityReservation(competitor116.submissionId, readOnly110), {
        status: "ready", stage: "no_reservation_observed", emailReservationObserved: false, phoneReservationObserved: false
      });
      assert.deepEqual(await inspectPermanentVisitIdentityReservation(request116.submissionId, failedRead110), { status: "unavailable" });
      const receiptInterrupted116 = await submitPermanentPublicVisitRegistration(request116, {
        ...recoveryDeps109,
        recordAdult: command => arrival116(command, { record: async () => { throw new Error("Synthetic receipt interruption"); } })
      });
      assert.deepEqual(receiptInterrupted116, { accepted: false, status: "try_later" });
      assert.deepEqual(await inspectPermanentVisitIdentityReservation(request116.submissionId, readOnly110), {
        status: "ready", stage: "created_profile_without_receipt", emailReservationObserved: true, phoneReservationObserved: dual
      });
      assert.equal((await visitors.getEntity<{ checkInCreationId: string }>("VISITOR", claim116.visitorId)).checkInCreationId, request116.submissionId);
      assert.equal((await recoveryJournal109.inspect(request116.submissionId)).status, "pending");
      await register(request116);
      await register(request116);
      assert.equal((await visitors.getEntity<{ visitorId: string }>("VISITOR_CHECK_IN", request116.submissionId)).visitorId, claim116.visitorId);
      assert.equal((await recoveryJournal109.inspect(request116.submissionId)).status, "completed");
      assert.deepEqual(await inspectPermanentVisitIdentityReservation(request116.submissionId, readOnly110), { status: "not_applicable" });
      assert.equal(await countRows(visitors, "VISITOR"), profiles116 + (dual ? 2 : 1));
      assert.equal(await countRows(visitors, "VISITOR_CHECK_IN"), receipts116 + (dual ? 2 : 1));
    }
    console.log("ACTUAL_SINGLE_AND_DUAL_ORPHAN_RESERVATIONS_IDENTIFIED=True");
    console.log("COMPETING_SUBMISSION_CANNOT_TAKE_RESERVATION=True");
    console.log("PROFILE_WITHOUT_RECEIPT_IDENTIFIED=True");
    console.log("EXACT_ORIGINAL_RETRY_RECOVERS_PROFILE_AND_RECEIPT=True");
    console.log("IDENTITY_INSPECTION_STORAGE_FAILURE_DENIED=True");
  }
);
