import assert from "node:assert/strict";
import {
  createStaffInvitation,
  type StaffInvitationDependencies
} from "../../src/services/staff/createStaffInvitation";

async function main(): Promise<void> {
  let graphCalls = 0;

  const input = {
    displayName: "Synthetic Staff",
    email: "synthetic@example.invalid",
    actorId: "synthetic-admin"
  };

  const dependencies: StaffInvitationDependencies = {
    blockLegacyInvitationBeforeGraph: true,
    sendInvitation: async () => {
      graphCalls++;
      throw new Error("Graph sender must never execute");
    }
  };

  {
    const result = await createStaffInvitation(input, dependencies);
    assert.equal(result.accepted, false);
    if (!result.accepted) {
      assert.equal(result.status, 503);
      assert.equal(
        result.error,
        "Legacy Staff invitation writer is fenced"
      );
    }
    assert.equal(graphCalls, 0);
    console.log("[PASS] Explicit fence denies before Graph");
  }

  {
    const result = await createStaffInvitation(
      { ...input, email: "OTHER@example.invalid" },
      dependencies
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 503);
    assert.equal(graphCalls, 0);
    console.log("[PASS] Alternate valid email cannot bypass fence");
  }

  {
    const result = await createStaffInvitation(
      { ...input, displayName: "Another Synthetic Staff" },
      dependencies
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 503);
    assert.equal(graphCalls, 0);
    console.log("[PASS] Different Staff identity remains fenced");
  }

  {
    const result = await createStaffInvitation(
      { ...input, actorId: "another-admin" },
      dependencies
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 503);
    assert.equal(graphCalls, 0);
    console.log("[PASS] Different actor cannot bypass fence");
  }

  {
    const result = await createStaffInvitation(
      { ...input, email: "not-an-email" },
      dependencies
    );
    assert.equal(result.accepted, false);
    assert.equal(graphCalls, 0);
    console.log("[PASS] Invalid input never triggers Graph");
  }

  {
    const result = await createStaffInvitation(
      { ...input, displayName: "" },
      {
        sendInvitation: async () => {
          graphCalls++;
          throw new Error("Must not execute");
        }
      }
    );
    assert.equal(result.accepted, false);
    if (!result.accepted) assert.equal(result.status, 400);
    assert.equal(graphCalls, 0);
    console.log("[PASS] Default-off preserves input validation");
  }

  console.log("[PASS] Six invitation fence regressions");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});