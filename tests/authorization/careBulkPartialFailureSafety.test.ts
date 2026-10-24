import assert from "node:assert/strict";
import {
  postCareCandidateAssignBulk
} from "../../src/functions/postCareCandidateAssignBulk";
import {
  postCareCandidateUnassignBulk
} from "../../src/functions/postCareCandidateUnassignBulk";

type Action = "assign" | "unassign";
type Failure = "none" | "before_write" | "after_write";

const VISITORS = ["visitor-a", "visitor-b", "visitor-c"];

async function execute(
  action: Action,
  visitorIds: string[],
  failOnVisit: number | null,
  failure: Failure
) {
  const persisted: string[] = [];
  const attempts: string[] = [];
  const calls: string[] = [];

  const req: any = {
    body: {
      visitorIds,
      assignedTo: "assignee-test"
    }
  };

  const context: any = {
    res: undefined,
    log: Object.assign(
      () => {},
      { warn: () => {}, error: () => {}, info: () => {} }
    )
  };

  let writeNumber = 0;

  const dependencies: any = {
    requireApiKey: () => ({ ok: true }),
    requireActor: async () => ({
      ok: true,
      actor: { staffId: "authorized-test-actor" }
    }),
    requireAssignee: async () => ({ ok: true }),
    getTable: () => {
      calls.push("getTable");
      return {};
    },
    ensureTable: async () => {
      calls.push("ensureTable");
    },
    getVisitor: async (visitorId: string) => {
      calls.push(`getVisitor:${visitorId}`);
      return { visitorId };
    },
    getProfile: async (_table: any, visitorId: string) => {
      calls.push(`getProfile:${visitorId}`);
      return null;
    },
    createProfile: (visitorId: string) => ({ visitorId }),
    upsertProfile: async (_table: any, profile: any) => {
      writeNumber++;
      const visitorId = profile.visitorId as string;
      attempts.push(visitorId);

      assert.equal(
        profile.assignedTo,
        action === "assign" ? "assignee-test" : null
      );

      if (writeNumber === failOnVisit && failure === "before_write") {
        throw new Error("Simulated definite pre-write failure");
      }

      persisted.push(visitorId);

      if (writeNumber === failOnVisit && failure === "after_write") {
        throw new Error("Simulated lost acknowledgment after persistence");
      }
    }
  };

  if (action === "assign") {
    await postCareCandidateAssignBulk(context, req, dependencies);
  } else {
    await postCareCandidateUnassignBulk(context, req, dependencies);
  }

  return {
    status: context.res?.status,
    body: context.res?.body,
    persisted,
    attempts,
    calls
  };
}

async function run(): Promise<void> {
  for (const action of ["assign", "unassign"] as const) {
    const success = await execute(action, VISITORS, null, "none");

    assert.equal(success.status, 200);
    assert.deepEqual(success.persisted, VISITORS);
    assert.deepEqual(success.attempts, VISITORS);
    assert.equal(success.body?.results?.length, 3);

    // Earlier visitor writes remain persisted after a later failure.
    const partial = await execute(action, VISITORS, 3, "before_write");

    assert.equal(partial.status, 500);
    assert.equal(partial.body?.ok, false);
    assert.deepEqual(partial.persisted, ["visitor-a", "visitor-b"]);
    assert.deepEqual(partial.attempts, VISITORS);
    assert.equal(partial.body?.results, undefined);

    // The writer may persist and then lose the success acknowledgment.
    const ambiguous = await execute(action, VISITORS, 2, "after_write");

    assert.equal(ambiguous.status, 500);
    assert.equal(ambiguous.body?.ok, false);
    assert.deepEqual(ambiguous.persisted, ["visitor-a", "visitor-b"]);
    assert.deepEqual(ambiguous.attempts, ["visitor-a", "visitor-b"]);
    assert.equal(ambiguous.body?.results, undefined);

    // Duplicate IDs are currently processed as independent write attempts.
    const duplicates = await execute(
      action,
      ["visitor-a", "visitor-a"],
      null,
      "none"
    );

    assert.equal(duplicates.status, 200);
    assert.deepEqual(duplicates.attempts, ["visitor-a", "visitor-a"]);
    assert.deepEqual(duplicates.persisted, ["visitor-a", "visitor-a"]);
    assert.equal(duplicates.body?.results?.length, 2);
  }

  console.log(
    "Care bulk partial-failure safety assertions passed."
  );
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
