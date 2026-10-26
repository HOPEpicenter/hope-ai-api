import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";
import {
  createDefaultFormationProfile,
  upsertFormationProfile
} from "../../src/storage/formation/formationProfilesRepo";

type RecordedCall = {
  entity: Record<string, unknown>;
  mode: unknown;
  options: unknown;
  argumentCount: number;
};

type FakeTable = {
  table: TableClient;
  calls: RecordedCall[];
  persisted: Record<string, unknown>[];
};

function fakeTable(
  fail: "none" | "before_write" | "after_write"
): FakeTable {
  const calls: RecordedCall[] = [];
  const persisted: Record<string, unknown>[] = [];

  const table = {
    upsertEntity: async (...args: unknown[]): Promise<void> => {
      const entity = args[0] as Record<string, unknown>;
      calls.push({
        entity,
        mode: args[1],
        options: args[2],
        argumentCount: args.length
      });

      if (fail === "before_write") {
        throw new Error("synthetic_pre_write_failure");
      }

      persisted.push({ ...entity });

      if (fail === "after_write") {
        throw new Error("synthetic_lost_acknowledgement");
      }
    }
  } as unknown as TableClient;

  return { table, calls, persisted };
}

function makeProfile() {
  const profile = createDefaultFormationProfile("synthetic-visitor");
  profile.assignedTo = "synthetic-assignee";

  return Object.assign(profile, {
    groups: ["synthetic-group"]
  });
}

async function run(): Promise<void> {
  // Successful call: Replace mode, without concurrency options.
  const success = fakeTable("none");
  const outcome = await upsertFormationProfile(
    success.table,
    makeProfile()
  );

  assert.equal(outcome, undefined);
  assert.equal(success.calls.length, 1);
  assert.equal(success.persisted.length, 1);
  assert.equal(success.calls[0].mode, "Replace");
  assert.equal(success.calls[0].argumentCount, 2);
  assert.equal(success.calls[0].options, undefined);
  assert.equal(
    success.calls[0].entity.partitionKey,
    "VISITOR"
  );
  assert.equal(
    success.calls[0].entity.rowKey,
    "synthetic-visitor"
  );
  assert.equal(
    success.calls[0].entity.assignedTo,
    "synthetic-assignee"
  );
  assert.equal(
    success.calls[0].entity.groupsJson,
    JSON.stringify(["synthetic-group"])
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      success.calls[0].entity,
      "groups"
    ),
    false
  );

  // A definite pre-write failure must propagate.
  const before = fakeTable("before_write");

  await assert.rejects(
    upsertFormationProfile(before.table, makeProfile()),
    /synthetic_pre_write_failure/
  );

  assert.equal(before.calls.length, 1);
  assert.equal(before.persisted.length, 0);

  // Lost acknowledgement: persistence may have happened,
  // although the wrapper rejects. No automatic retry occurs.
  const after = fakeTable("after_write");

  await assert.rejects(
    upsertFormationProfile(after.table, makeProfile()),
    /synthetic_lost_acknowledgement/
  );

  assert.equal(after.calls.length, 1);
  assert.equal(after.calls[0].mode, "Replace");
  assert.equal(after.calls[0].argumentCount, 2);
  assert.equal(after.persisted.length, 1);
  assert.equal(
    after.persisted[0].assignedTo,
    "synthetic-assignee"
  );

  console.log(
    "Formation profile write-boundary assertions passed."
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
