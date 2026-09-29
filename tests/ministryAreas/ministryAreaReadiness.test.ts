import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  SixWeekVisitorFollowupPlan
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import {
  requireAdminStaffActorForFunction
} from "../../src/functions/_shared/adminStaffActor";
import type {
  CareCandidate
} from "../../src/services/care/careCandidateContracts";
import type {
  MinistryAreaOverview
} from "../../src/services/ministryAreas/readMinistryAreaOverview";
import {
  readMinistryAreaReadiness
} from "../../src/services/ministryAreas/readMinistryAreaReadiness";
import type {
  MinistryAreaReadiness
} from "../../src/services/ministryAreas/readMinistryAreaReadiness";
import type {
  SixWeekFollowupQueue
} from "../../src/services/followups/readSixWeekVisitorFollowups";

const areaId = "ministry-area-readiness";

function staff(
  staffId: string,
  status: CanonicalStaffIdentity["status"],
  ministryAreaId: string | null
) {
  return {
    staffId,
    displayName: staffId,
    roleLabel: null,
    status,
    ministryAreaId
  };
}

const roster = [
  staff("staff-active", "active", areaId),
  staff("staff-pending", "pending", areaId),
  staff("staff-inactive", "inactive", areaId)
];

function overview(
  items: typeof roster = roster,
  status: "active" | "inactive" = "active",
  leaderStaffId: string | null = "staff-leader"
): MinistryAreaOverview {
  return {
    ministryArea: {
      ministryAreaId: areaId,
      displayName: "Care Ministry",
      status,
      leaderStaffId,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      lastEventId: "evt-ministry-area"
    },
    leader: null,
    staffSummary: {
      total: items.length,
      active: items.filter(item => item.status === "active").length,
      pending: items.filter(item => item.status === "pending").length,
      inactive: items.filter(item => item.status === "inactive").length
    },
    roster: items
  };
}

function careCandidate(
  visitorId: string,
  assignedTo: string | null,
  overrides: Partial<CareCandidate> = {}
): CareCandidate {
  return {
    visitorId,
    status: "candidate",
    reason: "needs_care",
    careLevel: "standard",
    careCategory: "followup_needs_care",
    carePriority: "normal",
    careAgeBucket: "new",
    escalationLevel: "none",
    recommendedCareAction: "review_followup",
    careSortScore: 0,
    openedAt: "2026-09-01T00:00:00.000Z",
    careOpenedBy: null,
    assignedTo,
    assignmentState: assignedTo ? "assigned" : "unassigned",
    assignmentBucket: assignedTo ? "owned" : "queue",
    daysOpen: 0,
    source: {
      workflowId: "care",
      followupOutcome: "needs_care",
      followupOutcomeAt: "2026-09-01T00:00:00.000Z"
    },
    ...overrides
  };
}

function plan(
  visitorId: string,
  ownerStaffId: string | null,
  nextTaskStatus: "upcoming" | "due" | "overdue" | null
): SixWeekVisitorFollowupPlan {
  const nextTask = nextTaskStatus
    ? {
        weekNumber: 1,
        action: "Make a personal welcome call or email",
        dueDate: "2026-09-10",
        status: nextTaskStatus,
        completedAt: null,
        completedBy: null,
        contactMethod: null,
        careOutcome: null,
        outcome: null,
        notes: null
      }
    : null;

  return {
    schemaVersion: 1,
    planId: `six-week-followup:${visitorId}`,
    visitorId,
    firstVisitDate: "2026-09-01",
    startedAt: "2026-09-01T00:00:00.000Z",
    startedBy: "staff-admin",
    ownerStaffId,
    contactConsent: true,
    preferredContactMethod: null,
    status: "active",
    needsOwner: ownerStaffId === null,
    tasks: nextTask ? [nextTask] : [],
    nextTask,
    completedTaskCount: 0,
    remainingTaskCount: 6,
    lastEventId: `evt-${visitorId}`,
    lastEventAt: "2026-09-01T00:00:00.000Z",
    pausedAt: null,
    cancelledAt: null,
    cancellationReason: null
  };
}

function queueItems(
  items: Array<{
    visitorId: string;
    ownerStaffId: string | null;
    nextTaskStatus: "upcoming" | "due" | "overdue" | null;
  }>
): SixWeekFollowupQueue {
  return {
    asOf: "2026-09-28T00:00:00.000Z",
    count: items.length,
    due: 0,
    overdue: 0,
    needsOwner: items.filter(item => item.ownerStaffId === null).length,
    items: items.map(item => ({
      visitorId: item.visitorId,
      displayName: "Private visitor name",
      email: "private@example.org",
      phone: "555-0100",
      plan: plan(
        item.visitorId,
        item.ownerStaffId,
        item.nextTaskStatus
      )
    }))
  };
}

async function readWith(
  options: {
    overview?: MinistryAreaOverview | null;
    care?: CareCandidate[];
    queue?: SixWeekFollowupQueue;
    readCareCandidates?: () => Promise<CareCandidate[]>;
    readSixWeekQueue?: () => Promise<SixWeekFollowupQueue>;
  } = {}
) {
  return readMinistryAreaReadiness(areaId, {
    readOverview: async () =>
      options.overview === undefined ? overview() : options.overview,
    readCareCandidates:
      options.readCareCandidates ??
      (async () => options.care ?? []),
    readSixWeekQueue:
      options.readSixWeekQueue ??
      (async () => options.queue ?? queueItems([]))
  });
}

async function readWithSignals(signals: {
  urgent?: number;
  overdue?: number;
  escalated?: number;
  elevated?: number;
  stale?: number;
  due?: number;
}): Promise<MinistryAreaReadiness> {
  const care: CareCandidate[] = [];
  const followups: Array<{
    visitorId: string;
    ownerStaffId: string;
    nextTaskStatus: "due" | "overdue";
  }> = [];

  const addCare = (
    key: string,
    count: number,
    overrides: Partial<CareCandidate>
  ) => {
    for (let index = 0; index < count; index += 1) {
      care.push(
        careCandidate(`${key}-${index}`, "staff-active", overrides)
      );
    }
  };

  addCare("urgent", signals.urgent ?? 0, {
    carePriority: "urgent"
  });
  addCare("escalated", signals.escalated ?? 0, {
    escalationLevel: "escalate"
  });
  addCare("elevated", signals.elevated ?? 0, {
    carePriority: "elevated"
  });
  addCare("stale", signals.stale ?? 0, {
    careAgeBucket: "stale"
  });

  for (let index = 0; index < (signals.due ?? 0); index += 1) {
    followups.push({
      visitorId: `due-${index}`,
      ownerStaffId: "staff-active",
      nextTaskStatus: "due"
    });
  }
  for (let index = 0; index < (signals.overdue ?? 0); index += 1) {
    followups.push({
      visitorId: `overdue-${index}`,
      ownerStaffId: "staff-active",
      nextTaskStatus: "overdue"
    });
  }

  const result = await readWith({
    care,
    queue: queueItems(followups)
  });
  assert.ok(result);
  return result;
}

async function run(): Promise<void> {
  assert.equal(await readMinistryAreaReadiness("   "), null);
  assert.equal(await readWith({ overview: null }), null);

  const inactiveArea = await readWith({
    overview: overview([roster[2]], "inactive"),
    care: [careCandidate("visitor-historical", "staff-inactive")],
    queue: queueItems([
      {
        visitorId: "visitor-historical-followup",
        ownerStaffId: "staff-inactive",
        nextTaskStatus: "due"
      }
    ])
  });
  assert.ok(inactiveArea);
  assert.equal(inactiveArea.ministryArea.status, "inactive");
  assert.equal(inactiveArea.care.totalOwned, 1);
  assert.equal(inactiveArea.sixWeekFollowup.totalOwned, 1);
  assert.equal(
    inactiveArea.recommendedFirstAction?.key,
    "due-followups"
  );

  const noLinkedStaff = await readWith({
    overview: overview([]),
    care: [careCandidate("visitor-one", "staff-outside")],
    queue: queueItems([
      {
        visitorId: "visitor-two",
        ownerStaffId: "staff-outside",
        nextTaskStatus: "overdue"
      },
      {
        visitorId: "visitor-three",
        ownerStaffId: null,
        nextTaskStatus: "due"
      }
    ])
  });
  assert.ok(noLinkedStaff);
  assert.deepEqual(noLinkedStaff.ownership, {
    staffIds: [],
    activeStaff: 0,
    pendingStaff: 0,
    inactiveStaff: 0
  });
  assert.equal(noLinkedStaff.care.totalOwned, 0);
  assert.equal(noLinkedStaff.sixWeekFollowup.totalOwned, 0);

  const readiness = await readWith({
    care: [
      careCandidate("urgent-stale-escalated", "staff-active", {
        carePriority: "urgent",
        careAgeBucket: "stale",
        escalationLevel: "escalate"
      }),
      careCandidate("elevated-stale", "staff-pending", {
        carePriority: "elevated",
        careAgeBucket: "stale"
      }),
      careCandidate("historical-urgent", "staff-inactive", {
        carePriority: "urgent"
      }),
      careCandidate("outside-owner", "staff-outside", {
        carePriority: "urgent",
        careAgeBucket: "stale",
        escalationLevel: "escalate"
      }),
      careCandidate("unassigned-care", null, {
        carePriority: "urgent",
        careAgeBucket: "stale",
        escalationLevel: "escalate"
      })
    ],
    queue: queueItems([
      {
        visitorId: "due-owned",
        ownerStaffId: "staff-active",
        nextTaskStatus: "due"
      },
      {
        visitorId: "overdue-inactive-owner",
        ownerStaffId: "staff-inactive",
        nextTaskStatus: "overdue"
      },
      {
        visitorId: "upcoming-pending-owner",
        ownerStaffId: "staff-pending",
        nextTaskStatus: "upcoming"
      },
      {
        visitorId: "overdue-outside-owner",
        ownerStaffId: "staff-outside",
        nextTaskStatus: "overdue"
      },
      {
        visitorId: "overdue-unowned",
        ownerStaffId: null,
        nextTaskStatus: "overdue"
      }
    ])
  });

  assert.ok(readiness);
  assert.deepEqual(readiness.ownership, {
    staffIds: ["staff-active", "staff-pending", "staff-inactive"],
    activeStaff: 1,
    pendingStaff: 1,
    inactiveStaff: 1
  });
  assert.deepEqual(readiness.care, {
    totalOwned: 3,
    urgent: 2,
    elevated: 1,
    stale: 2,
    escalated: 1
  });
  assert.deepEqual(readiness.sixWeekFollowup, {
    totalOwned: 3,
    due: 1,
    overdue: 1
  });
  assert.deepEqual(readiness.attention, {
    total: 3,
    urgentCare: 2,
    overdueFollowups: 1
  });

  const clear = await readWithSignals({});
  assert.equal(clear.recommendedFirstAction, null);

  const urgentWins = await readWithSignals({
    urgent: 2,
    overdue: 1,
    escalated: 1,
    elevated: 1,
    stale: 1,
    due: 1
  });
  assert.deepEqual(urgentWins.recommendedFirstAction, {
    key: "urgent-care",
    priority: "urgent",
    label: "Review urgent care",
    reason:
      "2 urgent care candidate(s) are owned by Staff linked to this Ministry Area.",
    source: "care",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: urgentWins.care.urgent
  });
  assert.equal(
    JSON.stringify(urgentWins.recommendedFirstAction).includes("visitor"),
    false
  );

  const overdueWins = await readWithSignals({
    overdue: 2,
    escalated: 1,
    elevated: 1,
    stale: 1,
    due: 1
  });
  assert.deepEqual(overdueWins.recommendedFirstAction, {
    key: "overdue-followups",
    priority: "urgent",
    label: "Review overdue follow-ups",
    reason:
      "2 six-week follow-up(s) owned by Staff linked to this Ministry Area are overdue.",
    source: "six-week-followup",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: overdueWins.sixWeekFollowup.overdue
  });
  assert.equal(
    JSON.stringify(overdueWins.recommendedFirstAction).includes("visitor"),
    false
  );

  const escalatedWins = await readWithSignals({
    escalated: 2,
    elevated: 1,
    stale: 1,
    due: 1
  });
  assert.deepEqual(escalatedWins.recommendedFirstAction, {
    key: "escalated-care",
    priority: "high",
    label: "Review escalated care",
    reason:
      "2 care candidate(s) owned by Staff linked to this Ministry Area require escalation.",
    source: "care",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: escalatedWins.care.escalated
  });

  const elevatedWins = await readWithSignals({
    elevated: 2,
    stale: 1,
    due: 1
  });
  assert.deepEqual(elevatedWins.recommendedFirstAction, {
    key: "elevated-care",
    priority: "high",
    label: "Review elevated care",
    reason:
      "2 elevated care candidate(s) are owned by Staff linked to this Ministry Area.",
    source: "care",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: elevatedWins.care.elevated
  });

  const staleWins = await readWithSignals({ stale: 2, due: 1 });
  assert.deepEqual(staleWins.recommendedFirstAction, {
    key: "stale-care",
    priority: "medium",
    label: "Review stale care",
    reason:
      "2 stale care candidate(s) are owned by Staff linked to this Ministry Area.",
    source: "care",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: staleWins.care.stale
  });

  const dueWins = await readWithSignals({ due: 2 });
  assert.deepEqual(dueWins.recommendedFirstAction, {
    key: "due-followups",
    priority: "medium",
    label: "Review due follow-ups",
    reason:
      "2 six-week follow-up(s) owned by Staff linked to this Ministry Area are due.",
    source: "six-week-followup",
    sourcePath:
      "/api/ministry-areas/ministry-area-readiness/readiness",
    count: dueWins.sixWeekFollowup.due
  });

  const leadershipOnly = await readWith({
    overview: overview([]),
    care: [careCandidate("leader-care", "staff-leader")],
    queue: queueItems([
      {
        visitorId: "leader-followup",
        ownerStaffId: "staff-leader",
        nextTaskStatus: "overdue"
      }
    ])
  });
  assert.ok(leadershipOnly);
  assert.equal(leadershipOnly.care.totalOwned, 0);
  assert.equal(leadershipOnly.sixWeekFollowup.totalOwned, 0);
  assert.equal(leadershipOnly.recommendedFirstAction, null);

  await assert.rejects(
    () => readWith({
      readCareCandidates: async () => {
        throw new Error("Care source unavailable");
      }
    }),
    /Care source unavailable/
  );
  await assert.rejects(
    () => readWith({
      readSixWeekQueue: async () => {
        throw new Error("Follow-up source unavailable");
      }
    }),
    /Follow-up source unavailable/
  );

  const serializedReadiness = JSON.stringify(readiness);
  for (const privateField of [
    "email",
    "phone",
    "entraTenantId",
    "entraObjectId",
    "Private visitor name",
    "private@example.org",
    "555-0100"
  ]) {
    assert.equal(serializedReadiness.includes(privateField), false);
  }

  const previousAdminApiKey = process.env.HOPE_ADMIN_API_KEY;
  const previousAdminStaffIds = process.env.HOPE_ADMIN_STAFF_IDS;

  try {
    process.env.HOPE_ADMIN_API_KEY = "test-admin-key";
    process.env.HOPE_ADMIN_STAFF_IDS = "staff-admin";

    const areaMember = await requireAdminStaffActorForFunction(
      {
        headers: {
          get: (name: string) => ({
            "x-admin-api-key": "test-admin-key",
            "x-hope-admin-actor-id": "staff-member"
          }[name.toLowerCase()] ?? null)
        }
      },
      async staffId => ({
        staffId,
        displayName: "Area Member",
        roleLabel: null,
        status: "active",
        createdAt: null,
        updatedAt: null,
        lastEventId: null,
        entraTenantId: null,
        entraObjectId: null,
        email: null,
        phone: null,
        ministryAreaId: areaId
      })
    );

    assert.equal(areaMember.ok, false);
    if (!areaMember.ok) {
      assert.equal(areaMember.status, 403);
    }
  } finally {
    if (previousAdminApiKey === undefined) {
      delete process.env.HOPE_ADMIN_API_KEY;
    } else {
      process.env.HOPE_ADMIN_API_KEY = previousAdminApiKey;
    }

    if (previousAdminStaffIds === undefined) {
      delete process.env.HOPE_ADMIN_STAFF_IDS;
    } else {
      process.env.HOPE_ADMIN_STAFF_IDS = previousAdminStaffIds;
    }
  }

  console.log("ministryAreaReadiness.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});