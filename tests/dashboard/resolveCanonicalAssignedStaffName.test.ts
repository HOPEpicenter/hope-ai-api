import assert from "node:assert/strict";
import {
  resolveCanonicalAssignedStaffName
} from "../../src/services/dashboard/readCanonicalVisitorDashboardCard";

async function main(): Promise<void> {
  const dynamicStaffId =
    "staff-b50c60c5ceb44ec48be837388968cebc";

  const resolved = await resolveCanonicalAssignedStaffName(
    dynamicStaffId,
    dynamicStaffId,
    async staffId => ({
      displayName:
        staffId === dynamicStaffId
          ? "Jessie Blair-Myrie"
          : null
    })
  );

  assert.equal(
    resolved,
    "Jessie Blair-Myrie",
    "dynamic Staff IDs should resolve through the canonical directory"
  );

  const unassigned = await resolveCanonicalAssignedStaffName(
    null,
    null,
    async () => ({
      displayName: "Should not be read"
    })
  );

  assert.equal(
    unassigned,
    null,
    "unassigned visitors should not have an owner display name"
  );

  const compatibilityFallback =
    await resolveCanonicalAssignedStaffName(
      "legacy-owner-id",
      "Legacy Owner",
      async () => null
    );

  assert.equal(
    compatibilityFallback,
    "Legacy Owner",
    "unknown Staff IDs should preserve the available compatibility name"
  );

  const idFallback =
    await resolveCanonicalAssignedStaffName(
      "unknown-owner-id",
      null,
      async () => null
    );

  assert.equal(
    idFallback,
    "unknown-owner-id",
    "unknown Staff IDs should remain diagnosable when no name exists"
  );

  console.log(
    "resolveCanonicalAssignedStaffName.test.ts passed"
  );
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
