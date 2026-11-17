import assert from "node:assert/strict";
import {
  createStaffInvitation
} from "../../src/services/staff/createStaffInvitation";

async function main(): Promise<void> {
  const previousSite = process.env.WEBSITE_SITE_NAME;
  const previousMode =
    process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;

  let graphCalls = 0;

  try {
    process.env.WEBSITE_SITE_NAME =
      "hope-kiosk-acceptance-api";

    for (const mode of [
      undefined,
      "legacy",
      "migration_hold",
      "coordinated",
      "invalid-mode"
    ]) {
      if (mode === undefined) {
        delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;
      } else {
        process.env.HOPE_STAFF_WRITER_TRANSITION_MODE = mode;
      }

      const result = await createStaffInvitation(
        {
          displayName: "Synthetic Staff",
          email: "synthetic@example.invalid",
          actorId: "synthetic-actor"
        },
        {
          sendInvitation: async () => {
            graphCalls++;
            throw new Error("GRAPH_MUST_NOT_BE_CALLED");
          }
        }
      );

      assert.equal(result.accepted, false);
      if (!result.accepted) {
        assert.equal(result.status, 503);
        assert.equal(
          result.error,
          "Staff invitation runtime writer is unavailable"
        );
      }
    }

    assert.equal(graphCalls, 0);

    console.log("KIOSK_ALL_MODES_INVITATION_DENIED=True");
    console.log("MICROSOFT_GRAPH_CALLS=0");
    console.log("K358FH_PRE_GRAPH_FENCE_PASSED=True");
  } finally {
    if (previousSite === undefined) {
      delete process.env.WEBSITE_SITE_NAME;
    } else {
      process.env.WEBSITE_SITE_NAME = previousSite;
    }

    if (previousMode === undefined) {
      delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;
    } else {
      process.env.HOPE_STAFF_WRITER_TRANSITION_MODE =
        previousMode;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
