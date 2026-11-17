import assert from "node:assert/strict";
import {
  submitStaffScopedAtomicCreation
} from "../../src/repositories/staffScopedAtomicCreation";

const event = {
  eventId: "evt-kiosk-runtime-fence",
  staffId: "staff-kiosk-runtime-fence",
  actorId: "synthetic-actor",
  type: "staff.created" as const,
  occurredAt: "2026-11-17T12:00:00.000Z",
  data: {
    displayName: "Synthetic Staff",
    status: "active" as const,
    entraTenantId: "11111111-1111-4111-8111-111111111111",
    entraObjectId: "22222222-2222-4222-8222-222222222222"
  }
};

async function main(): Promise<void> {
  const previousSite = process.env.WEBSITE_SITE_NAME;

  try {
    for (const siteName of [
      "hope-kiosk-acceptance-api",
      "hope-ai-api-staging",
      "hope-ai-api-production"
    ]) {
      process.env.WEBSITE_SITE_NAME = siteName;

      let writes = 0;

      const result = await submitStaffScopedAtomicCreation(
        event,
        {
          submitTransaction: async () => {
            writes++;
            throw new Error("WRITE_MUST_NOT_EXECUTE");
          }
        },
        true
      );

      assert.equal(result.status, "denied");
      assert.equal(result.executionPermitted, false);
      assert.equal(result.retryPermitted, false);
      assert.equal(result.productionWriterFenced, false);
      assert.equal(writes, 0);
    }

    console.log("AZURE_APP_DIRECT_CREATION_DENIED=True");
    console.log("TRANSACTION_CALLS=0");
    console.log("K358FZ_RUNTIME_FENCE_PASSED=True");
  } finally {
    if (previousSite === undefined) {
      delete process.env.WEBSITE_SITE_NAME;
    } else {
      process.env.WEBSITE_SITE_NAME = previousSite;
    }
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
