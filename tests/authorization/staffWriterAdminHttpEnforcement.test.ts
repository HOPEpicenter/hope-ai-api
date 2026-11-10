import assert from "node:assert/strict";

/**
 * Synthetic CommonJS module-substitution test.
 * Production source files and external services are never modified.
 * The authentication and service implementations are replaced only
 * inside this isolated test process.
 */

const variable = "HOPE_STAFF_WRITER_TRANSITION_MODE";
const originalMode = process.env[variable];

let checks = 0;
let authCalls = 0;
let staffCalls = 0;
let invitationCalls = 0;
let graphCalls = 0;
let authorizationAllowed = true;
let invitationFeatureEnabled = true;

function pass(message: string): void {
  checks++;
  console.log(`[PASS] ${message}`);
}

function request(spoof: Record<string, unknown> = {}): any {
  return {
    headers: {
      "x-staff-writer-transition-mode": "legacy",
      "HOPE_STAFF_WRITER_TRANSITION_MODE": "legacy"
    },
    query: {
      transitionMode: "legacy",
      ...spoof
    },
    body: {
      displayName: "Synthetic Staff",
      actorId: "spoofed-actor",
      status: "inactive",
      email: "synthetic@example.invalid",
      transitionMode: "legacy",
      ...spoof
    },
    params: {
      staffId: "synthetic-staff"
    }
  };
}

async function invoke(
  handler: (context: any, req: any) => Promise<void>,
  req: any
): Promise<any> {
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

async function main(): Promise<void> {
  // CommonJS module substitution is limited to this test process.
  // No real administrator directory reader or Graph sender runs.

  const admin = require("../../src/functions/_shared/adminStaffActor");
  const staff = require("../../src/services/staff/staffCommands");
  const invitations = require(
    "../../src/services/staff/createStaffInvitation"
  );
  const graph = require(
    "../../src/services/staff/microsoftGraphStaffInvitation"
  );
  const flags = require("../../src/config/featureFlags");

  const originals = {
    auth: admin.requireAdminStaffActorForFunction,
    create: staff.createStaffIdentity,
    update: staff.updateStaffIdentity,
    invite: invitations.createStaffInvitation,
    graph: graph.inviteMicrosoftGraphStaffMember,
    flags: flags.getFeatureFlags
  };

  try {
    admin.requireAdminStaffActorForFunction = async () => {
      authCalls++;
      return authorizationAllowed
        ? { ok: true, actorId: "synthetic-admin" }
        : {
            ok: false,
            status: 401,
            body: {
              ok: false,
              error: "Synthetic authorization rejected"
            }
          };
    };

    staff.createStaffIdentity = async () => {
      staffCalls++;
      return {
        accepted: true,
        staffId: "synthetic-staff",
        eventId: "synthetic-event",
        type: "staff.created"
      };
    };

    staff.updateStaffIdentity = async () => {
      staffCalls++;
      return {
        accepted: true,
        staffId: "synthetic-staff",
        eventId: "synthetic-event",
        type: "staff.updated"
      };
    };

    invitations.createStaffInvitation = async () => {
      invitationCalls++;
      return {
        accepted: true,
        staffId: "synthetic-staff",
        eventId: "synthetic-event",
        type: "staff.created"
      };
    };

    graph.inviteMicrosoftGraphStaffMember = async () => {
      graphCalls++;
      throw new Error("Graph must never execute in this test");
    };

    flags.getFeatureFlags = () => ({
      staffInvitations: invitationFeatureEnabled
    });

    const createRoute = require(
      "../../src/functions/postStaffIdentity/index"
    ).postStaffIdentity;

    const updateRoute = require(
      "../../src/functions/patchStaffIdentity/index"
    ).patchStaffIdentity;

    const inviteRoute = require(
      "../../src/functions/postStaffInvitation/index"
    ).postStaffInvitation;

    const routes = [
      { name: "creation", handler: createRoute },
      { name: "update", handler: updateRoute },
      { name: "invitation", handler: inviteRoute }
    ];

    for (const mode of [
      "migration_hold",
      "coordinated",
      "invalid_mode",
      ""
    ]) {
      process.env[variable] = mode;

      for (const route of routes) {
        const beforeStaff = staffCalls;
        const beforeInvite = invitationCalls;
        const beforeGraph = graphCalls;
        const beforeAuth = authCalls;

        const response = await invoke(
          route.handler,
          request({
            HOPE_STAFF_WRITER_TRANSITION_MODE: "legacy"
          })
        );

        assert.equal(response.status, 503);
        assert.equal(response.body.ok, false);
        assert.equal(staffCalls, beforeStaff);
        assert.equal(invitationCalls, beforeInvite);
        assert.equal(graphCalls, beforeGraph);
        assert.equal(authCalls, beforeAuth + 1);

        pass(`${route.name}: ${mode || "empty"} denies bypass`);
      }
    }

    authorizationAllowed = false;
    process.env[variable] = "migration_hold";

    for (const route of routes) {
      const beforeStaff = staffCalls;
      const beforeInvite = invitationCalls;

      const response = await invoke(
        route.handler,
        request()
      );

      assert.equal(response.status, 401);
      assert.equal(
        response.body.error,
        "Synthetic authorization rejected"
      );
      assert.equal(staffCalls, beforeStaff);
      assert.equal(invitationCalls, beforeInvite);

      pass(`${route.name}: authentication precedes hold`);
    }

    authorizationAllowed = true;

    // Invitation feature remains OFF unless explicitly injected.
    invitationFeatureEnabled = false;

    const disabled = await invoke(inviteRoute, request());

    assert.equal(disabled.status, 404);
    assert.equal(invitationCalls, 0);
    assert.equal(graphCalls, 0);

    pass("Invitation feature flag precedes migration hold");

    invitationFeatureEnabled = true;

    delete process.env[variable];

    for (const route of routes) {
      const response = await invoke(
        route.handler,
        request()
      );

      assert.equal(response.status, 202);
      pass(`${route.name}: absent mode preserves stub behavior`);
    }

    process.env[variable] = "legacy";

    for (const route of routes) {
      const response = await invoke(
        route.handler,
        request()
      );

      assert.equal(response.status, 202);
      pass(`${route.name}: explicit legacy preserves stub behavior`);
    }

    assert.equal(staffCalls, 4);
    assert.equal(invitationCalls, 2);
    assert.equal(graphCalls, 0);
    assert.equal(checks, 22);

    console.log("[PASS] All 22 admin HTTP enforcement checks");
    console.log("[SAFE] No actual Staff or Graph service executed");
  } finally {
    admin.requireAdminStaffActorForFunction = originals.auth;
    staff.createStaffIdentity = originals.create;
    staff.updateStaffIdentity = originals.update;
    invitations.createStaffInvitation = originals.invite;
    graph.inviteMicrosoftGraphStaffMember = originals.graph;
    flags.getFeatureFlags = originals.flags;

    if (originalMode === undefined) {
      delete process.env[variable];
    } else {
      process.env[variable] = originalMode;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});