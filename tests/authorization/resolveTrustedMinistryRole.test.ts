import assert from "node:assert/strict";
import { resolveTrustedMinistryRole } from "../../src/services/authorization/resolveTrustedMinistryRole";

type StaffInput = Parameters<typeof resolveTrustedMinistryRole>[0];

function check(
  label: string,
  staff: StaffInput,
  expected: ReturnType<typeof resolveTrustedMinistryRole>
): void {
  assert.equal(resolveTrustedMinistryRole(staff), expected, label);
}

check("active Pastor", { status: "active", roleLabel: "Pastor" }, "pastor");
check("normalized pastor", { status: "active", roleLabel: " PASTOR " }, "pastor");
check(
  "active Ministry Leader",
  { status: "active", roleLabel: "Ministry Leader" },
  "ministry_leader"
);
check(
  "normalized Ministry Leader",
  { status: "active", roleLabel: " ministry leader " },
  "ministry_leader"
);
check("active Staff", { status: "active", roleLabel: "Staff" }, "staff");
check("normalized staff", { status: "active", roleLabel: " STAFF " }, "staff");

check("inactive Pastor", { status: "inactive", roleLabel: "Pastor" }, null);
check("inactive Ministry Leader", { status: "inactive", roleLabel: "Ministry Leader" }, null);
check("inactive Staff", { status: "inactive", roleLabel: "Staff" }, null);
check("administrator excluded", { status: "active", roleLabel: "Administrator" }, null);
check("system administrator excluded", { status: "active", roleLabel: "system_administrator" }, null);
check("unknown role", { status: "active", roleLabel: "Youth Leader" }, null);
check("missing role", { status: "active", roleLabel: null }, null);
check("blank role", { status: "active", roleLabel: "  " }, null);
check("no staff", null, null);
check("undefined staff", undefined, null);

for (const malformed of [
  {},
  { status: "active", roleLabel: 42 },
  { status: "active", roleLabel: {} },
  { status: "ACTIVE", roleLabel: "Pastor" },
  { status: true, roleLabel: "Pastor" },
  { status: "active", roleLabel: ["Pastor"] }
]) {
  check("malformed input must deny", malformed as StaffInput, null);
}

console.log("resolveTrustedMinistryRole.test.ts passed");
