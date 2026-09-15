import assert from "node:assert/strict";
import {
  projectStaffDirectory,
  type StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";

const events: StaffEvent[] = [
  {
    eventId: "evt-create-contact",
    staffId: "staff-contact-test",
    type: "staff.created",
    occurredAt: "2026-09-15T00:00:00.000Z",
    actorId: "staff-admin-test",
    data: {
      displayName: "Contact Staff",
      status: "active",
      email: "FIRST.CONTACT@example.org",
      phone: " (201) 555-0100 "
    }
  },
  {
    eventId: "evt-update-contact",
    staffId: "staff-contact-test",
    type: "staff.updated",
    occurredAt: "2026-09-15T00:01:00.000Z",
    actorId: "staff-admin-test",
    data: {
      email: "updated.contact@example.org",
      phone: "201-555-0101"
    }
  },
  {
    eventId: "evt-create-legacy",
    staffId: "staff-contact-legacy",
    type: "staff.created",
    occurredAt: "2026-09-15T00:02:00.000Z",
    actorId: "staff-admin-test",
    data: {
      displayName: "Legacy Staff",
      status: "active"
    }
  }
];

const projected = projectStaffDirectory(events);
const updated = projected.find(
  item => item.staffId === "staff-contact-test"
);
const legacy = projected.find(
  item => item.staffId === "staff-contact-legacy"
);

assert(updated, "Expected updated contact staff identity.");
assert.equal(updated.email, "updated.contact@example.org");
assert.equal(updated.phone, "201-555-0101");

assert(legacy, "Expected legacy staff identity.");
assert.equal(legacy.email, null);
assert.equal(legacy.phone, null);

console.log("staffContactDetails.test.ts passed");
