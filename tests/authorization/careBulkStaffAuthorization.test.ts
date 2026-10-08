import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function readEndpoint(name: string): string {
  return fs.readFileSync(
    path.resolve(
      process.cwd(),
      "src/functions",
      name,
      "index.ts"
    ),
    "utf8"
  );
}

function assertAuthorizationBeforePersistence(
  name: string,
  requiresAssignee: boolean
): void {
  const source = readEndpoint(name);

  const apiKeyIndex = source.indexOf(
    "dependencies.requireApiKey ?? requireApiKeyForFunction"
  );

  const actorIndex = source.indexOf(
    "dependencies.requireActor ?? requireCareOwnerActor"
  );

  const tableIndex = source.indexOf(
    "dependencies.getTable ?? getFormationProfilesTableClient"
  );

  const ensureIndex = source.indexOf(
    "dependencies.ensureTable ?? ensureTable"
  );

  const writeIndex = source.indexOf(
    "dependencies.upsertProfile ?? upsertFormationProfile"
  );

  assert.ok(apiKeyIndex >= 0, `${name}: API key guard missing`);
  assert.ok(actorIndex >= 0, `${name}: Staff actor guard missing`);
  assert.ok(tableIndex >= 0, `${name}: storage initialization missing`);
  assert.ok(ensureIndex >= 0, `${name}: table guard missing`);
  assert.ok(writeIndex >= 0, `${name}: persistence missing`);

  assert.ok(
    apiKeyIndex < actorIndex,
    `${name}: API key must precede Staff actor authorization`
  );

  assert.ok(
    actorIndex < tableIndex,
    `${name}: Staff actor must be authorized before storage initialization`
  );

  assert.ok(
    actorIndex < ensureIndex,
    `${name}: Staff actor must be authorized before table initialization`
  );

  assert.ok(
    actorIndex < writeIndex,
    `${name}: Staff actor must be authorized before persistence`
  );

  if (requiresAssignee) {
    const assigneeIndex = source.indexOf(
      "dependencies.requireAssignee ?? requireCareOwnerAssignee"
    );

    assert.ok(
      assigneeIndex >= 0,
      `${name}: canonical assignee guard missing`
    );

    assert.ok(
      actorIndex < assigneeIndex,
      `${name}: Staff actor must be checked before assignee`
    );

    assert.ok(
      assigneeIndex < tableIndex,
      `${name}: assignee must be validated before storage`
    );

    assert.ok(
      assigneeIndex < writeIndex,
      `${name}: assignee must be validated before persistence`
    );
  }
}

function run(): void {
  assertAuthorizationBeforePersistence(
    "postCareCandidateAssignBulk",
    true
  );

  assertAuthorizationBeforePersistence(
    "postCareCandidateUnassignBulk",
    false
  );

  console.log(
    "careBulkStaffAuthorization.test.ts passed"
  );
}

async function runRuntimeTests(): Promise<void> {
  const { postCareCandidateAssignBulk } = await import(
    "../../src/functions/postCareCandidateAssignBulk"
  );
  const { postCareCandidateUnassignBulk } = await import(
    "../../src/functions/postCareCandidateUnassignBulk"
  );
  const {
    requireCareOwnerActor,
    requireCareOwnerAssignee
  } = await import("../../src/functions/_shared/careOwnerStaffActor");

  const originalKey = process.env.HOPE_API_KEY;
  process.env.HOPE_API_KEY = "local-test-key-only";

  function identity(
    roleLabel: string,
    status: "active" | "inactive" = "active"
  ): any {
    return {
      staffId: "test-staff",
      displayName: "Test Staff",
      roleLabel,
      status,
      ministryAreaId: null,
      entraTenantId: null,
      entraObjectId: null,
      email: null,
      phone: null,
      createdAt: "2026-10-08T00:00:00.000Z",
      updatedAt: "2026-10-08T00:00:00.000Z",
      lastEventId: "test-event"
    };
  }

  type Scenario = {
    name: string;
    apiKey?: string;
    actorId?: string;
    role?: string;
    active?: boolean;
    missingIdentity?: boolean;
    invalidAssignee?: boolean;
    expectedStatus: number;
  };

  const denied: Scenario[] = [
    { name: "missing API key", expectedStatus: 401 },
    {
      name: "invalid API key",
      apiKey: "invalid-key",
      expectedStatus: 401
    },
    {
      name: "missing Staff actor",
      apiKey: "local-test-key-only",
      expectedStatus: 401
    },
    {
      name: "inactive Staff actor",
      apiKey: "local-test-key-only",
      actorId: "staff-1",
      active: false,
      expectedStatus: 403
    },
    {
      name: "unauthorized Care Team actor",
      apiKey: "local-test-key-only",
      actorId: "staff-1",
      role: "Care Team",
      expectedStatus: 403
    },
    {
      name: "unknown Staff actor",
      apiKey: "local-test-key-only",
      actorId: "staff-1",
      missingIdentity: true,
      expectedStatus: 403
    }
  ];

  async function execute(
    action: "assign" | "unassign",
    scenario: Scenario,
    storageFailure = false
  ): Promise<{ status: number; calls: string[]; response: any }> {
    const calls: string[] = [];

    const req: any = {
      headers: {
        ...(scenario.apiKey
          ? { "x-api-key": scenario.apiKey }
          : {}),
        ...(scenario.actorId
          ? { "x-hope-staff-actor-id": scenario.actorId }
          : {})
      },
      body: {
        visitorIds: ["visitor-test"],
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

    const common: any = {
      requireActor: (request: any) =>
        requireCareOwnerActor(request, async () =>
          scenario.missingIdentity
            ? null
            : identity(
                scenario.role ?? "Pastor",
                scenario.active === false ? "inactive" : "active"
              )
        ),
      getTable: () => {
        calls.push("getTable");
        return {} as any;
      },
      ensureTable: async () => {
        calls.push("ensureTable");
      },
      getVisitor: async () => {
        calls.push("getVisitor");
        return { visitorId: "visitor-test" } as any;
      },
      getProfile: async () => {
        calls.push("getProfile");
        return null;
      },
      createProfile: () => {
        calls.push("createProfile");
        return {} as any;
      },
      upsertProfile: async (_table: any, profile: any) => {
        calls.push("upsertProfile");
        assert.equal(profile.visitorId, "visitor-test");
        assert.equal(
          profile.assignedTo,
          action === "assign" ? "assignee-test" : null
        );

        if (storageFailure) {
          throw new Error("Simulated storage failure");
        }
      }
    };

    if (action === "assign") {
      await postCareCandidateAssignBulk(context, req, {
        ...common,
        requireAssignee: (staffId: string) =>
          requireCareOwnerAssignee(staffId, async () =>
            scenario.invalidAssignee
              ? identity("Care Team")
              : identity("Ministry Leader")
          )
      });
    } else {
      await postCareCandidateUnassignBulk(context, req, common);
    }

    return {
      status: context.res?.status,
      response: context.res?.body,
      calls
    };
  }

  try {
    for (const action of ["assign", "unassign"] as const) {
      for (const scenario of denied) {
        const result = await execute(action, scenario);

        assert.equal(
          result.status,
          scenario.expectedStatus,
          `${action}: ${scenario.name}`
        );

        assert.deepEqual(
          result.calls,
          [],
          `${action}: ${scenario.name} must not access storage`
        );

        assert.equal(result.response?.ok, false);
      }

      for (const role of ["Pastor", "Ministry Leader"]) {
        const success = await execute(action, {
          name: `authorized ${role}`,
          apiKey: "local-test-key-only",
          actorId: "staff-1",
          role,
          expectedStatus: 200
        });

        assert.equal(success.status, 200);
        assert.equal(success.response?.ok, true);
        assert.deepEqual(success.response?.results?.length, 1);
        assert.equal(success.calls.includes("upsertProfile"), true);
      }

      const failure = await execute(
        action,
        {
          name: "storage failure",
          apiKey: "local-test-key-only",
          actorId: "staff-1",
          expectedStatus: 500
        },
        true
      );

      assert.equal(failure.status, 500);
      assert.equal(failure.response?.ok, false);
    }

    const invalid = await execute("assign", {
      name: "invalid assignee",
      apiKey: "local-test-key-only",
      actorId: "staff-1",
      invalidAssignee: true,
      expectedStatus: 400
    });

    assert.equal(invalid.status, 400);
    assert.deepEqual(
      invalid.calls,
      [],
      "invalid assignee must not access storage"
    );

    console.log("Care bulk runtime authorization tests passed");
  } finally {
    if (originalKey === undefined) {
      delete process.env.HOPE_API_KEY;
    } else {
      process.env.HOPE_API_KEY = originalKey;
    }
  }
}

async function main(): Promise<void> {
  run();
  await runRuntimeTests();
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});