import assert from "node:assert/strict";
import type { TableClient } from "@azure/data-tables";

import {
  classifyStaffWriterRuntimeEnforcement,
  readStaffWriterRuntimeEnforcement
} from "../../src/config/staffWriterRuntimeEnforcement";

import {
  StaffEventsRepository
} from "../../src/repositories/staffEventsRepository";

const fixture = {
  eventId: "synthetic-kiosk-fence",
  staffId: "synthetic-kiosk-staff",
  actorId: "synthetic-actor",
  occurredAt: "2026-11-17T00:00:00.000Z",
  type: "staff.created" as const,
  data: {
    displayName: "Synthetic",
    status: "active" as const
  }
};

async function main(): Promise<void> {
  const kiosk = "hope-kiosk-acceptance-api";

  for (const value of [
    undefined,
    "legacy",
    "migration_hold",
    "coordinated",
    "invalid"
  ]) {
    const decision = classifyStaffWriterRuntimeEnforcement(
      value, kiosk
    );

    assert.equal(decision.allowLegacyWriter, false);
    assert.equal(decision.blockInvitationBeforeGraph, true);
    assert.equal(decision.coordinatedExecutionPermitted, false);
    assert.equal(decision.authorizationGranted, false);
    assert.equal(decision.productionWriterFenced, false);
  }

  console.log("KIOSK_ALL_MODES_DENY_LEGACY=True");

  assert.equal(
    classifyStaffWriterRuntimeEnforcement(
      undefined, "hope-ai-api-staging"
    ).allowLegacyWriter,
    true
  );

  assert.equal(
    classifyStaffWriterRuntimeEnforcement(
      undefined, "hope-ai-api-production"
    ).allowLegacyWriter,
    true
  );

  console.log("OTHER_SITE_LEGACY_COMPATIBILITY_PRESERVED=True");

  const previousSite = process.env.WEBSITE_SITE_NAME;
  const previousMode = process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;

  try {
    process.env.WEBSITE_SITE_NAME = kiosk;
    delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;

    assert.equal(
      readStaffWriterRuntimeEnforcement().allowLegacyWriter,
      false
    );

    let writes = 0;

    const table = {
      async createEntity() {
        writes++;
      }
    } as unknown as TableClient;

    await assert.rejects(
      new StaffEventsRepository(table).append(fixture),
      /Canonical Staff event append is unavailable/
    );

    assert.equal(writes, 0);

    console.log("REAL_REPOSITORY_KIOSK_APPEND_DENIED=True");
  } finally {
    if (previousSite === undefined) {
      delete process.env.WEBSITE_SITE_NAME;
    } else {
      process.env.WEBSITE_SITE_NAME = previousSite;
    }

    if (previousMode === undefined) {
      delete process.env.HOPE_STAFF_WRITER_TRANSITION_MODE;
    } else {
      process.env.HOPE_STAFF_WRITER_TRANSITION_MODE = previousMode;
    }
  }

  console.log("K358FB_KIOSK_FENCE_TESTS_PASSED=True");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
