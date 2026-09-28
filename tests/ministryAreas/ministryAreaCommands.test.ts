import assert from "node:assert/strict";
import type { MinistryAreaEvent } from "../../src/domain/ministryAreas/projectMinistryAreas";
import { projectMinistryAreas } from "../../src/domain/ministryAreas/projectMinistryAreas";
import {
  createMinistryArea, readMinistryAreaAudit, readMinistryAreas, updateMinistryArea
} from "../../src/services/ministryAreas/ministryAreaCommands";

class InMemoryRepository {
  events: MinistryAreaEvent[] = [];
  revision = 0;
  conflictOnce = false;

  async readSnapshot() {
    return { events: [...this.events], version: String(this.revision), revision: this.revision };
  }

  async appendIfVersion(event: MinistryAreaEvent, version: string) {
    if (this.conflictOnce) {
      this.conflictOnce = false;
      return false;
    }
    if (version !== String(this.revision)) return false;
    this.events.push(event);
    this.revision++;
    return true;
  }
}

const commandId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function run(): Promise<void> {
  const repo = new InMemoryRepository();
  const deps = { repository: repo, now: () => "2026-09-28T12:00:00.000Z",
    newMinistryAreaId: () => "ministry-area-opaque1" };
  const created = await createMinistryArea({ commandId: commandId(1), actorId: "admin-1",
    displayName: "  Youth   Ministry  " }, deps);
  assert.deepEqual(created, { accepted: true, eventId: `evt-${commandId(1)}`,
    ministryAreaId: "ministry-area-opaque1", type: "ministryArea.created" });
  assert.deepEqual(await readMinistryAreas(repo), [{
    ministryAreaId: "ministry-area-opaque1", displayName: "Youth Ministry", status: "active",
    createdAt: "2026-09-28T12:00:00.000Z", updatedAt: "2026-09-28T12:00:00.000Z",
    lastEventId: `evt-${commandId(1)}`
  }]);

  // A lost HTTP response can be retried with the same commandId; no second ID/event is created.
  assert.deepEqual(await createMinistryArea({ commandId: commandId(1), actorId: "admin-1",
    displayName: "Youth Ministry" }, deps), created);
  assert.equal(repo.events.length, 1);
  assert.deepEqual(await createMinistryArea({ commandId: commandId(2), actorId: "admin-1",
    displayName: "youth ministry" }, deps), { accepted: false, status: 409,
    error: "Ministry Area display name is already in use" });
  assert.equal((await createMinistryArea({ commandId: commandId(1), actorId: "other-admin",
    displayName: "Youth Ministry" }, deps)).accepted, false);

  repo.conflictOnce = true;
  const updated = await updateMinistryArea({ commandId: commandId(3), actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1", displayName: "Next Generation",
    reason: "Ministry name updated" }, deps);
  assert.equal(updated.accepted, true);
  assert.equal(repo.events.length, 2);
  assert.deepEqual(await updateMinistryArea({ commandId: commandId(3), actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1", displayName: "Next Generation",
    reason: "Ministry name updated" }, deps), updated);
  assert.equal(repo.events.length, 2);

  const deactivated = await updateMinistryArea({ commandId: commandId(4), actorId: "admin-2",
    ministryAreaId: "ministry-area-opaque1", status: "inactive" }, deps);
  assert.equal(deactivated.accepted, true);
  assert.deepEqual((await readMinistryAreas(repo)).map(item => [item.ministryAreaId,
    item.displayName, item.status]), [["ministry-area-opaque1", "Next Generation", "inactive"]]);
  const audit = await readMinistryAreaAudit("ministry-area-opaque1", repo);
  assert.equal(audit.length, 3);
  assert.deepEqual(audit.map(event => event.type), [
    "ministryArea.updated", "ministryArea.updated", "ministryArea.created"
  ]);
  assert.equal(audit[0].actorId, "admin-2");
  assert.equal((await createMinistryArea({ commandId: commandId(5), actorId: "admin-1",
    displayName: "Next Generation" }, deps)).accepted, false);

  assert.deepEqual(await updateMinistryArea({ commandId: commandId(6), actorId: "admin-1",
    ministryAreaId: "missing", status: "inactive" }, deps), {
    accepted: false, status: 404, error: "Ministry Area not found"
  });
  assert.equal((await createMinistryArea({ commandId: "bad", actorId: "admin-1",
    displayName: "Women" }, deps)).accepted, false);
  assert.equal((await createMinistryArea({ commandId: commandId(7), actorId: "admin-1",
    displayName: " " }, deps)).accepted, false);
  assert.equal((await updateMinistryArea({ commandId: commandId(8), actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1", status: "unknown" as any }, deps)).accepted, false);

  // Replay is stable even if storage returns the rows out of order at identical timestamps.
  const replay = projectMinistryAreas([...repo.events].reverse());
  assert.deepEqual(replay, await readMinistryAreas(repo));
  assert.deepEqual(projectMinistryAreas([...repo.events, repo.events[1]]), replay);

  // Concurrent requests for the same normalized name must not both succeed.
  const raceRepo = new InMemoryRepository();
  const [first, second] = await Promise.all([
    createMinistryArea({ commandId: commandId(9), actorId: "admin-1", displayName: "Care Team" },
      { repository: raceRepo, newMinistryAreaId: () => "area-one" }),
    createMinistryArea({ commandId: commandId(10), actorId: "admin-2", displayName: "care team" },
      { repository: raceRepo, newMinistryAreaId: () => "area-two" })
  ]);
  assert.equal([first, second].filter(item => item.accepted).length, 1);
  assert.equal(raceRepo.events.length, 1);
}

run().catch(error => { console.error(error); process.exitCode = 1; });
