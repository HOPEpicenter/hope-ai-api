import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { TransactionAction } from "@azure/data-tables";

import { createIsolatedVisitorTestTable } from "./permanentVisitorIsolatedTestTable";
import { createPermanentVisitorConsentRepository } from "../src/repositories/permanentVisitorConsentRepository";
import { SixWeekFollowupEventsRepository } from "../src/repositories/sixWeekFollowupEventsRepository";
import { createPermanentVisitorConsentRuntime } from "../src/services/followups/permanentVisitorConsentRuntime";
import { enrollRecordedPublicVisitor } from "../src/services/followups/enrollRecordedPublicVisitor";
import { projectSixWeekVisitorFollowup } from "../src/domain/followups/projectSixWeekVisitorFollowup";

for (const scenario of ["grant", "decline", "concurrent_withdrawal"] as const) {
  test(`atomic public enrollment: ${scenario}`, async () => {
    const visitors = createIsolatedVisitorTestTable(
      "AtomicVisitors" + randomUUID().replace(/-/g, "")
    );

    const shared = createIsolatedVisitorTestTable(
      "AtomicFollowups" + randomUUID().replace(/-/g, "")
    );

    await visitors.createTable();

    try {
      await shared.createTable();

      try {
        const visitorId = randomUUID();
        const submissionId = randomUUID();
        const visitDate = "2026-11-30";
        const serviceId = `visit-${visitDate}`;
        const recordedAt = `${visitDate}T15:00:00.000Z`;
        const granted = scenario !== "decline";

        const evidence = {
          visitorId, submissionId, serviceId, visitDate
        };

        await visitors.createEntity({
          partitionKey: "VISITOR",
          rowKey: visitorId
        });

        await visitors.createEntity({
          partitionKey: "VISITOR_CHECK_IN",
          rowKey: submissionId,
          visitorId,
          serviceId,
          recordedAt,
          registrationDetailsJson: JSON.stringify({
            version: 1,
            contactConsent: granted
          })
        });

        const authority = createPermanentVisitorConsentRepository(
          shared, true
        );

        assert.equal((await authority.apply(visitorId, {
          kind: "new_profile",
          evidenceId: submissionId,
          initialConsent: granted
        })).status, "committed");

        const runtime = createPermanentVisitorConsentRuntime(
          visitors, shared, recordedAt, true
        );

        const repository = new SixWeekFollowupEventsRepository(shared);

        let injectedWithdrawal = false;

        const racingAuthority = createPermanentVisitorConsentRepository({
          getEntity: shared.getEntity.bind(shared),
          listEntities: shared.listEntities.bind(shared),
          submitTransaction: async (actions: TransactionAction[]) => {
            if (!injectedWithdrawal) {
              injectedWithdrawal = true;

              const withdrawal = await authority.apply(visitorId, {
                kind: "public_request",
                expectedRevision: 1,
                requestId: randomUUID(),
                requestedConsent: false
              });

              assert.equal(withdrawal.status, "committed");
            }

            return shared.submitTransaction(actions);
          }
        }, true);

        const deps = {
          enabled: true,
          visitors,
          repository,
          readEnrollmentPermission: runtime.readEnrollmentPermission,
          appendAuthorizedEnrollment:
            scenario === "concurrent_withdrawal"
              ? racingAuthority.appendPublicEnrollment
              : runtime.appendAuthorizedEnrollment
        };

        const result = await enrollRecordedPublicVisitor(evidence, deps);
        const events = await repository.listByVisitor(visitorId);

        if (scenario === "grant") {
          assert.equal(result, "enrolled");
          assert.equal(events.length, 1);
          assert.equal(events[0].type, "six_week_followup.plan_started");

          const plan = projectSixWeekVisitorFollowup(events);

          assert.ok(plan);
          assert.ok(plan.nextTask);

          assert.equal(
            await enrollRecordedPublicVisitor(evidence, deps),
            "existing"
          );

          assert.equal(
            (await repository.listByVisitor(visitorId)).length,
            1
          );

          // Ordinary append remains held in authority mode.
          await assert.rejects(repository.append(events[0]));
        } else {
          assert.equal(result, "not_eligible");
          assert.equal(events.length, 0);
        }

        if (scenario === "concurrent_withdrawal") {
          assert.equal(injectedWithdrawal, true);
        }

        // Consent metadata must never enter the event projector.
        assert.equal((await repository.listAll()).length, events.length);
      } finally {
        await shared.deleteTable();
      }
    } finally {
      await visitors.deleteTable();
    }
  });
}