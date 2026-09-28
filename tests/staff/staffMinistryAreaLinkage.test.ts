import assert from "node:assert/strict";
import { projectStaffDirectory, type StaffEvent } from "../../src/domain/staff/projectStaffDirectory";
import type { CanonicalMinistryArea } from "../../src/domain/ministryAreas/projectMinistryAreas";
import { createStaffIdentity, updateStaffIdentity } from "../../src/services/staff/staffCommands";
import { readStaffIdentityAudit } from "../../src/services/staff/readStaffIdentityAudit";

class Repository {
  events: StaffEvent[] = [];
  async append(event: StaffEvent): Promise<void> { this.events.push(event); }
  async listAll(): Promise<StaffEvent[]> { return [...this.events]; }
}

async function run(): Promise<void> {
  const repository = new Repository();
  const area: CanonicalMinistryArea = {
    ministryAreaId: "ministry-area-opaque1",
    displayName: "Local Ministry",
    status: "active",
    createdAt: "2026-09-28T00:00:00Z",
    updatedAt: "2026-09-28T00:00:00Z",
    lastEventId: "evt-area"
  };
  const readMinistryArea = async (id: string) =>
    id === area.ministryAreaId ? area : null;
  const deps = {
    repository: repository as any,
    readMinistryArea,
    now: () => "2026-09-28T00:00:00Z",
    newEventId: (() => { let i = 0; return () => `evt-staff-${++i}`; })(),
    newStaffId: () => "staff-opaque1"
  };
  const rejectedCreate = await createStaffIdentity({
    displayName: "Invalid Area", actorId: "admin-1",
    ministryAreaId: "ministry-area-unknown"
  }, deps);
  assert.equal(rejectedCreate.accepted ? 0 : rejectedCreate.status, 404);
  assert.equal(repository.events.length, 0);
  const create = await createStaffIdentity({
    displayName: "Care Staff", roleLabel: "Care Team Staff",
    actorId: "admin-1", ministryAreaId: " ministry-area-opaque1 "
  }, deps);
  assert.equal(create.accepted, true);
  assert.equal(projectStaffDirectory(repository.events)[0].ministryAreaId, area.ministryAreaId);
  assert.equal(projectStaffDirectory(repository.events)[0].roleLabel, "Care Team Staff");

  area.displayName = "Renamed Ministry";
  area.status = "inactive";
  const renameReplay = projectStaffDirectory([...repository.events].reverse());
  assert.equal(renameReplay[0].ministryAreaId, area.ministryAreaId);
  const unrelated = await updateStaffIdentity({
    staffId: "staff-opaque1", displayName: "Care Staff Updated", actorId: "admin-1"
  }, deps);
  assert.equal(unrelated.accepted, true, "inactive historical link must not prevent an unrelated edit");
  const inactive = await updateStaffIdentity({
    staffId: "staff-opaque1", ministryAreaId: area.ministryAreaId, actorId: "admin-1"
  }, deps);
  assert.deepEqual(inactive, { accepted: false, status: 409, error: "Ministry Area is inactive" });
  const missing = await updateStaffIdentity({
    staffId: "staff-opaque1", ministryAreaId: "ministry-area-unknown", actorId: "admin-1"
  }, deps);
  assert.equal(missing.accepted, false);
  assert.equal(missing.accepted ? 0 : missing.status, 404);
  const blank = await updateStaffIdentity({
    staffId: "staff-opaque1", ministryAreaId: " ", actorId: "admin-1"
  }, deps);
  assert.equal(blank.accepted ? 0 : blank.status, 400);
  const combined = await updateStaffIdentity({
    staffId: "staff-opaque1", status: "inactive", ministryAreaId: null, actorId: "admin-1"
  }, deps);
  assert.equal(combined.accepted ? 0 : combined.status, 400);
  assert.equal(repository.events.length, 2, "rejected writes must not append");

  const clear = await updateStaffIdentity({
    staffId: "staff-opaque1", ministryAreaId: null, actorId: "admin-1"
  }, deps);
  assert.equal(clear.accepted, true);
  assert.equal(projectStaffDirectory([...repository.events].reverse())[0].ministryAreaId, null);
  const audit = await readStaffIdentityAudit("staff-opaque1", repository as any);
  assert.equal(audit[0].changes.ministryAreaId, null);
  assert.equal(audit[0].actorId, "admin-1");

  const legacy = projectStaffDirectory([{ ...repository.events[0],
    staffId: "staff-legacy", data: { displayName: "Legacy", status: "active" }
  }]);
  assert.equal(legacy[0].ministryAreaId, null);
  area.status = "active";
  const linkedAgain = await updateStaffIdentity({
    staffId: "staff-opaque1", ministryAreaId: area.ministryAreaId, actorId: "admin-1"
  }, deps);
  assert.equal(linkedAgain.accepted, true);
  assert.equal(projectStaffDirectory(repository.events)[0].ministryAreaId, area.ministryAreaId);
  const deactivate = await updateStaffIdentity({
    staffId: "staff-opaque1", status: "inactive", actorId: "admin-1"
  }, deps);
  assert.equal(deactivate.accepted, true);
  assert.equal(projectStaffDirectory(repository.events)[0].ministryAreaId, area.ministryAreaId);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
