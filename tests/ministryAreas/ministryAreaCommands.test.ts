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
  const activeLeader = {
    staffId: "staff-leader-1",
    displayName: "Active Leader",
    roleLabel: "Ministry Leader",
    status: "active" as const,
    createdAt: "2026-09-28T00:00:00.000Z",
    updatedAt: "2026-09-28T00:00:00.000Z",
    lastEventId: "evt-staff-leader",
    entraTenantId: null,
    entraObjectId: null,
    email: null,
    phone: null,
    ministryAreaId: null
  };

  const inactiveLeader = {
    ...activeLeader,
    staffId: "staff-leader-inactive",
    displayName: "Inactive Leader",
    status: "inactive" as const
  };

  const secondLeader = {
    ...activeLeader,
    staffId: "staff-leader-2",
    displayName: "Second Active Leader"
  };

  const pendingLeader = {
    ...activeLeader,
    staffId: "staff-leader-pending",
    displayName: "Pending Leader",
    status: "pending" as const
  };

  let activeLeaderCurrentlyActive = true;

  const readStaffIdentity = async (staffId: string) => {
    if (staffId === activeLeader.staffId) {
      return activeLeaderCurrentlyActive
        ? activeLeader
        : {
            ...activeLeader,
            status: "inactive" as const
          };
    }

    if (staffId === secondLeader.staffId) return secondLeader;
    if (staffId === pendingLeader.staffId) return pendingLeader;
    if (staffId === inactiveLeader.staffId) return inactiveLeader;
    return null;
  };

  const deps = { repository: repo, now: () => "2026-09-28T12:00:00.000Z",
    newMinistryAreaId: () => "ministry-area-opaque1", readStaffIdentity };
  const created = await createMinistryArea({ commandId: commandId(1), actorId: "admin-1",
    displayName: "  Youth   Ministry  " }, deps);
  assert.deepEqual(created, { accepted: true, eventId: `evt-${commandId(1)}`,
    ministryAreaId: "ministry-area-opaque1", type: "ministryArea.created" });
  assert.deepEqual(await readMinistryAreas(repo), [{
    ministryAreaId: "ministry-area-opaque1", displayName: "Youth Ministry", status: "active",
    leaderStaffId: null,
    leaderStaffIds: [],
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

  const leaderAssigned = await updateMinistryArea({
    commandId: commandId(11),
    actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1",
    leaderStaffId: activeLeader.staffId,
    reason: "Assign canonical Ministry Area leader"
  }, deps);

  assert.equal(leaderAssigned.accepted, true);
  assert.equal(
    (await readMinistryAreas(repo))[0].leaderStaffId,
    activeLeader.staffId
  );

  activeLeaderCurrentlyActive = false;

  const replayAfterLeaderDeactivation =
    await updateMinistryArea({
      commandId: commandId(11),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffId: activeLeader.staffId,
      reason: "Assign canonical Ministry Area leader"
    }, deps);

  assert.deepEqual(
    replayAfterLeaderDeactivation,
    leaderAssigned
  );

  assert.equal(
    (await readMinistryAreas(repo))[0].leaderStaffId,
    activeLeader.staffId
  );

  activeLeaderCurrentlyActive = true;

  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(12),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffId: "staff-missing"
    }, deps),
    {
      accepted: false,
      status: 404,
      error: "Leader Staff identity not found"
    }
  );

  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(13),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffId: inactiveLeader.staffId
    }, deps),
    {
      accepted: false,
      status: 409,
      error: "Leader Staff identity is inactive"
    }
  );

  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(14),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffId: "   "
    }, deps),
    {
      accepted: false,
      status: 400,
      error: "leaderStaffId must be a nonempty Staff ID or null"
    }
  );

  const leaderCleared = await updateMinistryArea({
    commandId: commandId(15),
    actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1",
    leaderStaffId: null,
    reason: "Clear Ministry Area leader"
  }, deps);

  assert.equal(leaderCleared.accepted, true);
  assert.equal(
    (await readMinistryAreas(repo))[0].leaderStaffId,
    null
  );
  assert.deepEqual(
    (await readMinistryAreas(repo))[0].leaderStaffIds,
    []
  );

  // (F) Multi-leader update accepts two active canonical Staff identities, preserving given order.
  const multiLeaderAssigned = await updateMinistryArea({
    commandId: commandId(16),
    actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1",
    leaderStaffIds: [secondLeader.staffId, activeLeader.staffId],
    reason: "Assign multiple Ministry Area leaders"
  }, deps);
  assert.equal(multiLeaderAssigned.accepted, true);
  assert.deepEqual(
    (await readMinistryAreas(repo))[0].leaderStaffIds,
    [secondLeader.staffId, activeLeader.staffId]
  );
  assert.equal(
    (await readMinistryAreas(repo))[0].leaderStaffId,
    secondLeader.staffId
  );

  // (D) Duplicate leader IDs deterministically dedupe; (E) surrounding whitespace normalizes.
  const dedupedLeaders = await updateMinistryArea({
    commandId: commandId(17),
    actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1",
    leaderStaffIds: [`  ${activeLeader.staffId}  `, secondLeader.staffId, activeLeader.staffId],
    reason: "Reassign multiple Ministry Area leaders"
  }, deps);
  assert.equal(dedupedLeaders.accepted, true);
  assert.deepEqual(
    (await readMinistryAreas(repo))[0].leaderStaffIds,
    [activeLeader.staffId, secondLeader.staffId]
  );

  // (L) Requesting the same effective leader array is a no-op; no event is written.
  const eventsBeforeNoop = repo.events.length;
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(18),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [activeLeader.staffId, secondLeader.staffId]
    }, deps),
    { accepted: false, status: 400, error: "No Ministry Area field would change" }
  );
  assert.equal(repo.events.length, eventsBeforeNoop);

  // (M) Retry with the same commandId and an identical normalized leader array is replay-safe.
  const eventsBeforeReplay = repo.events.length;
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(17),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [activeLeader.staffId, `  ${secondLeader.staffId}  `],
      reason: "Reassign multiple Ministry Area leaders"
    }, deps),
    dedupedLeaders
  );
  assert.equal(repo.events.length, eventsBeforeReplay);

  // (N) Reusing the same commandId with a different leader array fails closed with 409.
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(17),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [secondLeader.staffId],
      reason: "Reassign multiple Ministry Area leaders"
    }, deps),
    { accepted: false, status: 409, error: "commandId was already used for a different command" }
  );

  // (G) One Staff identity may lead multiple Ministry Areas at once.
  const secondArea = await createMinistryArea({
    commandId: commandId(24),
    actorId: "admin-1",
    displayName: "Second Ministry"
  }, { ...deps, newMinistryAreaId: () => "ministry-area-second" });
  assert.equal(secondArea.accepted, true);
  const secondAreaLeaderAssigned = await updateMinistryArea({
    commandId: commandId(25),
    actorId: "admin-1",
    ministryAreaId: secondArea.ministryAreaId,
    leaderStaffIds: [activeLeader.staffId]
  }, deps);
  assert.equal(secondAreaLeaderAssigned.accepted, true);
  const areasAfterSharedLeader = await readMinistryAreas(repo);
  assert.ok(
    areasAfterSharedLeader
      .find(item => item.ministryAreaId === "ministry-area-opaque1")
      ?.leaderStaffIds.includes(activeLeader.staffId)
  );
  assert.ok(
    areasAfterSharedLeader
      .find(item => item.ministryAreaId === secondArea.ministryAreaId)
      ?.leaderStaffIds.includes(activeLeader.staffId)
  );

  // (O) Supplying both leaderStaffIds and leaderStaffId fails closed with 400.
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(19),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffId: activeLeader.staffId,
      leaderStaffIds: [activeLeader.staffId]
    }, deps),
    { accepted: false, status: 400, error: "Provide either leaderStaffIds or leaderStaffId, not both" }
  );

  // (H) An unknown member of leaderStaffIds returns 404.
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(20),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [activeLeader.staffId, "staff-missing"]
    }, deps),
    { accepted: false, status: 404, error: "Leader Staff identity not found: staff-missing" }
  );

  // (I) An inactive leader in leaderStaffIds returns 409.
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(21),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [activeLeader.staffId, inactiveLeader.staffId]
    }, deps),
    {
      accepted: false,
      status: 409,
      error: `Leader Staff identity is not active: ${inactiveLeader.staffId}`
    }
  );

  // (J) A pending leader in leaderStaffIds returns 409.
  assert.deepEqual(
    await updateMinistryArea({
      commandId: commandId(22),
      actorId: "admin-1",
      ministryAreaId: "ministry-area-opaque1",
      leaderStaffIds: [pendingLeader.staffId]
    }, deps),
    {
      accepted: false,
      status: 409,
      error: `Leader Staff identity is not active: ${pendingLeader.staffId}`
    }
  );

  // (K) An empty leaderStaffIds array is valid and clears all leaders.
  const clearedMultiLeaders = await updateMinistryArea({
    commandId: commandId(23),
    actorId: "admin-1",
    ministryAreaId: "ministry-area-opaque1",
    leaderStaffIds: []
  }, deps);
  assert.equal(clearedMultiLeaders.accepted, true);
  assert.deepEqual(
    (await readMinistryAreas(repo)).find(item => item.ministryAreaId === "ministry-area-opaque1")
      ?.leaderStaffIds,
    []
  );
  assert.equal(
    (await readMinistryAreas(repo)).find(item => item.ministryAreaId === "ministry-area-opaque1")
      ?.leaderStaffId,
    null
  );

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
