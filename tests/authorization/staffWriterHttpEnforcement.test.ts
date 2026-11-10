import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  createPostStaffInvitationActivationHandler
} from "../../src/functions/postStaffInvitationActivation/index";

const variable = "HOPE_STAFF_WRITER_TRANSITION_MODE";

const previous = {
  mode: process.env[variable],
  apiKey: process.env.HOPE_API_KEY,
  storage: process.env.STORAGE_CONNECTION_STRING
};

const key = "synthetic-staff-fence-key";
let passed = 0;
let activations = 0;

function pass(name: string): void {
  passed++;
  console.log(`[PASS] ${name}`);
}

function request(
  suppliedKey: string | undefined,
  spoof: Record<string, unknown> = {}
): any {
  const headers: Record<string, string> = {};

  if (suppliedKey !== undefined) {
    headers["x-api-key"] = suppliedKey;
  }

  return {
    headers: {
      ...headers,
      get: (name: string) =>
        headers[name.toLowerCase()] ?? null
    },
    params: {
      entraTenantId: "11111111-1111-4111-8111-111111111111",
      entraObjectId: "22222222-2222-4222-8222-222222222222"
    },
    body: spoof,
    query: spoof
  };
}

const handler = createPostStaffInvitationActivationHandler({
  getAuthorizationConfiguration: () => ({
    enforcementEnabled: false
  } as any),
  activate: async () => {
    activations++;
    return {
      accepted: true,
      staffId: "synthetic-staff",
      activated: true,
      eventId: "synthetic-event"
    };
  }
});

async function invoke(req: any): Promise<any> {
  const context: any = {
    res: null,
    log: Object.assign(
      () => undefined,
      { error: () => undefined }
    )
  };

  await handler(context, req);

  assert.ok(context.res);
  return context.res;
}

async function run(): Promise<void> {
  try {
    process.env.HOPE_API_KEY = key;
    process.env.STORAGE_CONNECTION_STRING =
      "UseDevelopmentStorage=true";

    const blockedModes = [
      "migration_hold",
      "coordinated",
      "invalid_mode",
      ""
    ];

    for (const mode of blockedModes) {
      process.env[variable] = mode;

      const before = activations;

      const ordinary = await invoke(request(key));

      assert.equal(ordinary.status, 503);
      assert.equal(ordinary.body.ok, false);
      assert.equal(activations, before);

      pass(`${mode || "empty"}: activation blocked`);

      const spoof = {
        transitionMode: "legacy",
        HOPE_STAFF_WRITER_TRANSITION_MODE: "legacy"
      };

      const bypass = await invoke(request(key, spoof));

      assert.equal(bypass.status, 503);
      assert.equal(activations, before);

      pass(`${mode || "empty"}: body/query bypass denied`);

      const headerBypass = request(key);
      headerBypass.headers["x-staff-writer-transition-mode"] =
        "legacy";

      const headerResult = await invoke(headerBypass);

      assert.equal(headerResult.status, 503);
      assert.equal(activations, before);

      pass(`${mode || "empty"}: header bypass denied`);

      const unauthorized = await invoke(request(undefined));

      assert.equal(unauthorized.status, 401);
      assert.equal(
        unauthorized.body.authRejectedBy,
        "postStaffInvitationActivation"
      );
      assert.equal(activations, before);

      pass(`${mode || "empty"}: authorization precedes hold`);
    }

    delete process.env[variable];

    const defaultResult = await invoke(request(key));

    assert.equal(defaultResult.status, 200);
    assert.equal(defaultResult.body.ok, true);
    assert.equal(activations, 1);

    pass("Absent mode preserves synthetic activation");

    process.env[variable] = "legacy";

    const legacyResult = await invoke(request(key));

    assert.equal(legacyResult.status, 200);
    assert.equal(activations, 2);

    pass("Explicit legacy preserves synthetic activation");

    const routes = [
      {
        path: "src/functions/postStaffIdentity/index.ts",
        auth: "requireAdminStaffActorForFunction(req)",
        action: "createStaffIdentity({"
      },
      {
        path: "src/functions/patchStaffIdentity/index.ts",
        auth: "requireAdminStaffActorForFunction(req)",
        action: "updateStaffIdentity({"
      },
      {
        path: "src/functions/postStaffInvitation/index.ts",
        auth: "requireAdminStaffActorForFunction(req)",
        action: "createStaffInvitation("
      },
      {
        path:
          "src/functions/postStaffInvitationActivation/index.ts",
        auth: "requireApiKeyForFunction(req)",
        action: "dependencies.activate({"
      }
    ];

    for (const route of routes) {
      const source = readFileSync(
        join(process.cwd(), route.path),
        "utf8"
      );

      const authAt = source.indexOf(route.auth);
      const guardAt = source.indexOf(
        "if (!writerEnforcement.allowLegacyWriter)"
      );
      const actionAt = source.indexOf(route.action);

      assert.ok(authAt >= 0);
      assert.ok(guardAt > authAt);
      assert.ok(actionAt > guardAt);
      assert.equal(
        source.split(
          "if (!writerEnforcement.allowLegacyWriter)"
        ).length - 1,
        1
      );

      if (route.path.includes("postStaffInvitation/index")) {
        const flagAt = source.indexOf(
          "if (!getFeatureFlags().staffInvitations)"
        );
        assert.ok(flagAt >= 0 && flagAt < guardAt);
      }

      if (
        route.path.includes(
          "postStaffInvitationActivation/index"
        )
      ) {
        const entraAt = source.indexOf(
          "if (activationAuthorization.enforcementEnabled)"
        );
        assert.ok(entraAt >= 0 && entraAt < guardAt);
      }

      pass(`Source guard ordering: ${route.path}`);
    }

    assert.equal(passed, 22);

    console.log(
      "[PASS] All 22 HTTP enforcement foundation checks"
    );
    console.log(
      "[SAFE] No live Staff storage or Graph operation"
    );
  } finally {
    for (const [name, value] of [
      [variable, previous.mode],
      ["HOPE_API_KEY", previous.apiKey],
      ["STORAGE_CONNECTION_STRING", previous.storage]
    ] as const) {
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});