import assert from "node:assert/strict";
import {
  createStaffIdentity,
  updateStaffIdentity
} from "../../src/services/staff/staffCommands";
import {
  activateStaffInvitation
} from "../../src/services/staff/activateStaffInvitation";

async function main(): Promise<void> {
  const blockedModes: unknown[] = [
    "migration_hold",
    "coordinated",
    "invalid_mode",
    null
  ];

  let passed = 0;
  let storageCalls = 0;
  let atomicCalls = 0;

  const repository = {
    async append(): Promise<void> {
      storageCalls++;
      throw new Error("Legacy write must not execute");
    },
    async listAll(): Promise<never> {
      storageCalls++;
      throw new Error("Canonical read must not execute");
    }
  };

  for (const mode of blockedModes) {
    const create = await createStaffIdentity(
      {
        displayName: "Synthetic Staff",
        actorId: "synthetic-admin"
      },
      {
        transitionMode: mode,
        repository: repository as any,
        atomicCreationEnabled: true,
        atomicCreation: async () => {
          atomicCalls++;
          throw new Error("Atomic creation must not execute");
        }
      }
    );

    assert.equal(create.accepted, false);
    if (!create.accepted) assert.equal(create.status, 503);
    assert.equal(storageCalls, 0);
    assert.equal(atomicCalls, 0);
    passed++;
    console.log(`[PASS] Create Staff denied for ${String(mode)}`);

    const update = await updateStaffIdentity(
      {
        staffId: "synthetic-staff-id",
        displayName: "Updated Synthetic Staff",
        actorId: "synthetic-admin"
      },
      {
        transitionMode: mode,
        repository: repository as any,
        atomicMutationEnabled: true,
        atomicMutation: async () => {
          atomicCalls++;
          throw new Error("Atomic mutation must not execute");
        }
      }
    );

    assert.equal(update.accepted, false);
    if (!update.accepted) assert.equal(update.status, 503);
    assert.equal(storageCalls, 0);
    assert.equal(atomicCalls, 0);
    passed++;
    console.log(`[PASS] Update Staff denied for ${String(mode)}`);

    const deactivate = await updateStaffIdentity(
      {
        staffId: "synthetic-staff-id",
        status: "inactive",
        actorId: "synthetic-admin"
      },
      {
        transitionMode: mode,
        repository: repository as any,
        atomicDeactivationEnabled: true,
        atomicDeactivation: async () => {
          atomicCalls++;
          throw new Error("Atomic deactivation must not execute");
        }
      }
    );

    assert.equal(deactivate.accepted, false);
    if (!deactivate.accepted) assert.equal(deactivate.status, 503);
    assert.equal(storageCalls, 0);
    assert.equal(atomicCalls, 0);
    passed++;
    console.log(`[PASS] Deactivation denied for ${String(mode)}`);

    const activation = await activateStaffInvitation(
      {
        entraTenantId: "11111111-1111-4111-8111-111111111111",
        entraObjectId: "22222222-2222-4222-8222-222222222222"
      },
      {
        transitionMode: mode,
        repository: repository as any,
        atomicMutationEnabled: true,
        atomicMutation: async () => {
          atomicCalls++;
          throw new Error("Atomic activation must not execute");
        }
      }
    );

    assert.equal(activation.accepted, false);
    if (!activation.accepted) assert.equal(activation.status, 503);
    assert.equal(storageCalls, 0);
    assert.equal(atomicCalls, 0);
    passed++;
    console.log(`[PASS] Activation denied for ${String(mode)}`);
  }

  assert.equal(passed, 16);
  assert.equal(storageCalls, 0);
  assert.equal(atomicCalls, 0);

  console.log("[PASS] All 16 integrated deny-only scenarios");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});