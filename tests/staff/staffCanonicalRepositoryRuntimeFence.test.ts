import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import { StaffEventsRepository } from "../../src/repositories/staffEventsRepository";
import type { StaffEvent } from "../../src/domain/staff/projectStaffDirectory";

const setting = "HOPE_STAFF_WRITER_TRANSITION_MODE";
const original = process.env[setting];

const fixture: StaffEvent = {
  eventId: "synthetic-event-154m",
  staffId: "synthetic-staff-154m",
  type: "staff.created",
  occurredAt: "2026-11-10T00:00:00.000Z",
  actorId: "synthetic-admin",
  data: {
    displayName: "Synthetic Staff",
    status: "active"
  }
};

async function main(): Promise<void> {
  try {
    for (const mode of [
      "migration_hold",
      "coordinated",
      "invalid-mode"
    ]) {
      process.env[setting] = mode;

      let storageWrites = 0;
      let storageReads = 0;

      const table = {
        async createEntity() {
          storageWrites++;
        },
        async *listEntities() {
          storageReads++;
          yield {
            partitionKey: fixture.staffId,
            rowKey: `${fixture.occurredAt}__${fixture.eventId}`,
            eventId: fixture.eventId,
            staffId: fixture.staffId,
            type: fixture.type,
            occurredAt: fixture.occurredAt,
            actorId: fixture.actorId,
            dataJson: JSON.stringify(fixture.data)
          };
        }
      } as unknown as TableClient;

      const repository = new StaffEventsRepository(table);

      await assert.rejects(
        repository.append(fixture),
        /Canonical Staff event append is unavailable/
      );

      assert.equal(storageWrites, 0, mode);

      assert.deepEqual(await repository.listAll(), [fixture]);
      assert.equal(storageReads, 1, mode);

      console.log(`[PASS] ${mode}: append denied; read preserved`);
    }

    process.env[setting] = "legacy";

    let legacyWrites = 0;

    const legacyTable = {
      async createEntity() {
        legacyWrites++;
      }
    } as unknown as TableClient;

    await new StaffEventsRepository(legacyTable).append(fixture);

    assert.equal(legacyWrites, 1);

    console.log("[PASS] Explicit legacy append preserved");
  } finally {
    if (original === undefined) {
      delete process.env[setting];
    } else {
      process.env[setting] = original;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
