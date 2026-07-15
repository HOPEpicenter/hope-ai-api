import {
  projectStaffDirectory,
  type StaffEvent
} from "../../src/domain/staff/projectStaffDirectory";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const createdAt = "2026-07-13T12:00:00.000Z";
const updatedAt = "2026-07-13T12:05:00.000Z";
const deactivatedAt = "2026-07-13T12:10:00.000Z";

const events: StaffEvent[] = [
  {
    eventId: "evt-update",
    staffId: "staff-test-1",
    type: "staff.updated",
    occurredAt: updatedAt,
    actorId: "admin-test",
    data: {
      displayName: "Pastor Updated",
      roleLabel: "Care Pastor"
    }
  },
  {
    eventId: "evt-create",
    staffId: "staff-test-1",
    type: "staff.created",
    occurredAt: createdAt,
    actorId: "admin-test",
    data: {
      displayName: "Pastor Original",
      roleLabel: "Pastoral Care",
      status: "active"
    }
  },
  {
    eventId: "evt-deactivate",
    staffId: "staff-test-1",
    type: "staff.deactivated",
    occurredAt: deactivatedAt,
    actorId: "admin-test",
    data: {
      status: "inactive",
      reason: "No longer serving in this role"
    }
  }
];

const first = projectStaffDirectory(events);
const second = projectStaffDirectory([...events].reverse());

assert(
  JSON.stringify(first) === JSON.stringify(second),
  "Projection must be deterministic regardless of input ordering."
);

const projected = first.find(item => item.staffId === "staff-test-1");

assert(projected, "Expected dynamically created staff identity.");
assert(
  projected.displayName === "Pastor Updated",
  "Expected latest display name."
);
assert(
  projected.roleLabel === "Care Pastor",
  "Expected latest role label."
);
assert(
  projected.status === "inactive",
  "Expected deactivated status."
);
assert(
  projected.createdAt === createdAt,
  "Expected original createdAt."
);
assert(
  projected.updatedAt === deactivatedAt,
  "Expected deactivation timestamp as updatedAt."
);
assert(
  projected.lastEventId === "evt-deactivate",
  "Expected deactivation event as lastEventId."
);

const emptyProjection = projectStaffDirectory([]);

assert(
  emptyProjection.length === 0,
  "An empty Staff event stream must produce an empty canonical directory."
);

const compatibilityIdentity = first.find(
  item => item.staffId === "ops-user-1"
);

assert(
  !compatibilityIdentity,
  "Compatibility operator IDs must not appear without Staff events."
);

const duplicateCreate: StaffEvent[] = [
  {
    eventId: "evt-create-a",
    staffId: "staff-duplicate",
    type: "staff.created",
    occurredAt: "2026-07-13T13:00:00.000Z",
    actorId: "admin-test",
    data: {
      displayName: "First Name",
      status: "active"
    }
  },
  {
    eventId: "evt-create-b",
    staffId: "staff-duplicate",
    type: "staff.created",
    occurredAt: "2026-07-13T13:01:00.000Z",
    actorId: "admin-test",
    data: {
      displayName: "Duplicate Name",
      status: "active"
    }
  }
];

const duplicateProjection = projectStaffDirectory(duplicateCreate);
const duplicate = duplicateProjection.find(
  item => item.staffId === "staff-duplicate"
);

assert(duplicate, "Expected first create event to project.");
assert(
  duplicate.displayName === "First Name",
  "Duplicate create event must not replace the original identity."
);

console.log("projectStaffDirectory.test.ts passed");
