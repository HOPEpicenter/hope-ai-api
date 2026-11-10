import assert from "node:assert/strict";
import {
  createStaffIdentity,
  updateStaffIdentity
} from "../../src/services/staff/staffCommands";
import {
  createStaffInvitation
} from "../../src/services/staff/createStaffInvitation";
import {
  activateStaffInvitation
} from "../../src/services/staff/activateStaffInvitation";

const setting = "HOPE_STAFF_WRITER_TRANSITION_MODE";
const previous = process.env[setting];

let checks = 0;
let storageReads = 0;
let storageAppends = 0;
let atomicCalls = 0;
let graphCalls = 0;

const repository = {
  async listAll(): Promise<never> {
    storageReads++;
    throw new Error("Unexpected synthetic storage read");
  },
  async append(): Promise<never> {
    storageAppends++;
    throw new Error("Unexpected synthetic Staff event append");
  }
};

const atomic = async (): Promise<never> => {
  atomicCalls++;
  throw new Error("Unexpected synthetic atomic execution");
};

const sendInvitation = async (): Promise<never> => {
  graphCalls++;
  throw new Error("Unexpected synthetic Graph invocation");
};

function assertBlocked(
  name: string,
  result: { accepted: boolean; status?: number }
): void {
  assert.equal(result.accepted, false, name);
  assert.equal(result.status, 503, name);
  assert.equal(storageReads, 0, name);
  assert.equal(storageAppends, 0, name);
  assert.equal(atomicCalls, 0, name);
  assert.equal(graphCalls, 0, name);

  checks++;
  console.log(`[PASS] ${name}`);
}

async function run(): Promise<void> {
  try {
    for (const mode of [
      "migration_hold",
      "coordinated",
      "unexpected",
      ""
    ]) {
      process.env[setting] = mode;

      const label = mode || "empty";

      const create = await createStaffIdentity(
        {
          displayName: "Synthetic Staff",
          actorId: "synthetic-admin"
        },
        {
          transitionMode: "legacy",
          repository: repository as any,
          atomicCreationEnabled: true,
          atomicCreation: atomic
        }
      );

      assertBlocked(`${label}: creation`, create);

      const update = await updateStaffIdentity(
        {
          staffId: "synthetic-staff",
          actorId: "synthetic-admin",
          displayName: "Updated Synthetic Staff"
        },
        {
          transitionMode: "legacy",
          repository: repository as any,
          atomicMutationEnabled: true,
          atomicMutation: atomic
        }
      );

      assertBlocked(`${label}: update`, update);

      const deactivate = await updateStaffIdentity(
        {
          staffId: "synthetic-staff",
          actorId: "synthetic-admin",
          status: "inactive"
        },
        {
          transitionMode: "legacy",
          repository: repository as any,
          atomicDeactivationEnabled: true,
          atomicDeactivation: atomic
        }
      );

      assertBlocked(`${label}: deactivation`, deactivate);

      const invitation = await createStaffInvitation(
        {
          displayName: "Synthetic Invitee",
          email: "synthetic@example.invalid",
          actorId: "synthetic-admin"
        },
        {
          repository: repository as any,
          blockLegacyInvitationBeforeGraph: false,
          sendInvitation
        }
      );

      assertBlocked(`${label}: invitation before Graph`, invitation);

      const activation = await activateStaffInvitation(
        {
          entraTenantId: "11111111-1111-4111-8111-111111111111",
          entraObjectId: "22222222-2222-4222-8222-222222222222"
        },
        {
          transitionMode: "legacy",
          repository: repository as any,
          atomicMutationEnabled: true,
          atomicMutation: atomic
        }
      );

      assertBlocked(`${label}: activation`, activation);
    }

    delete process.env[setting];

    const invalidCreate = await createStaffIdentity(
      { displayName: "", actorId: "synthetic-admin" },
      { repository: repository as any }
    );

    assert.equal(invalidCreate.accepted, false);
    if (!invalidCreate.accepted) {
      assert.equal(invalidCreate.status, 400);
    }
    checks++;
    console.log("[PASS] Absent setting preserves create validation");

    const invalidInvitation = await createStaffInvitation(
      {
        displayName: "Synthetic",
        email: "invalid-email",
        actorId: "synthetic-admin"
      },
      {
        repository: repository as any,
        sendInvitation
      }
    );

    assert.equal(invalidInvitation.accepted, false);
    if (!invalidInvitation.accepted) {
      assert.equal(invalidInvitation.status, 400);
    }
    checks++;
    console.log("[PASS] Absent setting preserves invitation validation");

    assert.equal(storageReads, 0);
    assert.equal(storageAppends, 0);
    assert.equal(atomicCalls, 0);
    assert.equal(graphCalls, 0);
    assert.equal(checks, 22);

    console.log("[PASS] All 22 direct-service checks");
    console.log("[SAFE] Zero storage, atomic or Graph calls");
  } finally {
    if (previous === undefined) {
      delete process.env[setting];
    } else {
      process.env[setting] = previous;
    }
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});