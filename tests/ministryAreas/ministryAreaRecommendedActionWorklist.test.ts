import assert from "node:assert/strict";
import type {
  CanonicalStaffIdentity
} from "../../src/domain/staff/projectStaffDirectory";
import type {
  SixWeekVisitorFollowupPlan
} from "../../src/domain/followups/projectSixWeekVisitorFollowup";
import type {
  CareCandidate
} from "../../src/services/care/careCandidateContracts";
import type {
  MinistryAreaOverview
} from "../../src/services/ministryAreas/readMinistryAreaOverview";
import {
  readMinistryAreaRecommendedActionWorklist,
  type MinistryAreaRecommendedActionWorklist,
  type MinistryAreaRecommendedActionWorklistItem
} from "../../src/services/ministryAreas/readMinistryAreaRecommendedActionWorklist";
import type {
  SixWeekFollowupQueue,
  SixWeekFollowupQueueItem
} from "../../src/services/followups/readSixWeekVisitorFollowups";

const ministryAreaId = "ministry-area-worklist";

function staff(
  staffId: string,
  status: CanonicalStaffIdentity["status"]
) {
  return {
    staffId,
    displayName: staffId,
    roleLabel: null,
    status,
    ministryAreaId
  };
}

const linkedStaff = [
  staff("staff-active", "active"),
  staff("staff-pending", "pending"),
  staff("staff-inactive", "inactive")
];

function overview(
  roster = linkedStaff,
  leaderStaffId: string | null = "staff-leader",
  status: "active" | "inactive" = "active"
): MinistryAreaOverview {
  return {
    ministryArea: {
      ministryAreaId,
      displayName: "Worklist Ministry",
      status,
      leaderStaffId,
      leaderStaffIds: leaderStaffId ? [leaderStaffId] : [],
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      lastEventId: "evt-area"
    },
    leader: null,
    leaders: [],
    staffSummary: {
      total: roster.length,
      active: roster.filter(item => item.status === "active").length,
      pending: roster.filter(item => item.status === "pending").length,
      inactive: roster.filter(item => item.status === "inactive").length
    },
    roster
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
    careOpenedBy: "private-opener-id",
    assignedTo,
    assignmentState: assignedTo ? "assigned" : "unassigned",
    assignmentBucket: assignedTo ? "owned" : "queue",
    daysOpen: 1,
    source: {
      workflowId: "care",
      followupOutcome: "needs_care",
      followupOutcomeAt: "2026-09-01T00:00:00.000Z"
    },
    ...overrides
  };
}

function followupItem(
  visitorId: string,
  ownerStaffId: string | null,
  taskStatus: "upcoming" | "due" | "overdue" | null
): SixWeekFollowupQueueItem {
  const nextTask = taskStatus === null
    ? null
    : {
        weekNumber: 2,
        action: "Canonical task action",
        dueDate: "2026-09-10",
        status: taskStatus,
        completedAt: null,
        completedBy: null,
        contactMethod: null,
        careOutcome: null,
        outcome: null,
        notes: "Private follow-up notes"
      };
  const plan: SixWeekVisitorFollowupPlan = {
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

  return {
    visitorId,
    displayName: "Private visitor name",
    email: "private@example.org",
    phone: "555-0100",
    plan
  };
}

function queue(items: SixWeekFollowupQueueItem[]): SixWeekFollowupQueue {
  return {
    asOf: "2026-09-28T00:00:00.000Z",
    count: items.length,
    due: items.filter(item => item.plan.nextTask?.status === "due").length,
    overdue: items.filter(item => item.plan.nextTask?.status === "overdue").length,
    needsOwner: items.filter(item => item.plan.ownerStaffId === null).length,
    items
  };
}

async function readWorklist(options: {
  area?: MinistryAreaOverview | null;
  care?: CareCandidate[];
  followups?: SixWeekFollowupQueueItem[];
  onReadOverview?: () => void;
  onReadCare?: () => void;
  onReadFollowups?: () => void;
} = {}): Promise<MinistryAreaRecommendedActionWorklist | null> {
  return readMinistryAreaRecommendedActionWorklist(ministryAreaId, {
    readOverview: async () => {
      options.onReadOverview?.();
      return options.area === undefined ? overview() : options.area;
    },
    readCareCandidates: async () => {
      options.onReadCare?.();
      return options.care ?? [];
    },
    readSixWeekQueue: async () => {
      options.onReadFollowups?.();
      return queue(options.followups ?? []);
    }
  });
}

function assertAction(
  result: MinistryAreaRecommendedActionWorklist | null,
  key: NonNullable<MinistryAreaRecommendedActionWorklist["recommendedFirstAction"]>["key"],
  visitorIds: string[],
  kind: MinistryAreaRecommendedActionWorklistItem["kind"]
): asserts result is MinistryAreaRecommendedActionWorklist {
  assert.ok(result);
  assert.equal(result.recommendedFirstAction?.key, key);
  assert.equal(
    result.recommendedFirstAction?.count,
    result.items.length
  );
  assert.deepEqual(
    result.items.map(item => item.visitorId),
    visitorIds
  );
  assert.ok(result.items.every(item => item.kind === kind));
}

async function run(): Promise<void> {
  let careReads = 0;
  let followupReads = 0;
  const missing = await readWorklist({
    area: null,
    onReadCare: () => { careReads += 1; },
    onReadFollowups: () => { followupReads += 1; }
  });
  assert.equal(missing, null);
  assert.equal(careReads, 0);
  assert.equal(followupReads, 0);

  const zeroState = await readWorklist();
  assert.ok(zeroState);
  assert.equal(zeroState.recommendedFirstAction, null);
  assert.deepEqual(zeroState.items, []);

  let overviewReads = 0;
  careReads = 0;
  followupReads = 0;
  await readWorklist({
    onReadOverview: () => { overviewReads += 1; },
    onReadCare: () => { careReads += 1; },
    onReadFollowups: () => { followupReads += 1; },
    care: [careCandidate("snapshot-urgent", "staff-active", {
      carePriority: "urgent"
    })],
    followups: [followupItem("snapshot-due", "staff-active", "due")]
  });
  assert.deepEqual([overviewReads, careReads, followupReads], [1, 1, 1]);

  const urgent = await readWorklist({
    care: [
      careCandidate("urgent-first", "staff-active", {
        carePriority: "urgent"
      }),
      careCandidate("outside-urgent", "staff-outside", {
        carePriority: "urgent"
      }),
      careCandidate("escalated-lower", "staff-active", {
        escalationLevel: "escalate"
      }),
      careCandidate("urgent-second", "staff-inactive", {
        carePriority: "urgent"
      }),
      careCandidate("elevated-lower", "staff-active", {
        carePriority: "elevated"
      }),
      careCandidate("stale-lower", "staff-active", {
        careAgeBucket: "stale"
      }),
      careCandidate("leader-urgent", "staff-leader", {
        carePriority: "urgent"
      }),
      careCandidate("unassigned-urgent", null, {
        carePriority: "urgent"
      })
    ],
    followups: [
      followupItem("owned-overdue-lower", "staff-active", "overdue"),
      followupItem("owned-due-lower", "staff-active", "due"),
      followupItem("outside-overdue", "staff-outside", "overdue"),
      followupItem("leader-overdue", "staff-leader", "overdue")
    ]
  });
  assertAction(
    urgent,
    "urgent-care",
    ["urgent-first", "urgent-second"],
    "care"
  );

  const overdue = await readWorklist({
    care: [
      careCandidate("lower-escalated", "staff-active", {
        escalationLevel: "escalate"
      }),
      careCandidate("outside-urgent", "staff-outside", {
        carePriority: "urgent"
      })
    ],
    followups: [
      followupItem("overdue-first", "staff-pending", "overdue"),
      followupItem("due-lower", "staff-active", "due"),
      followupItem("overdue-second", "staff-inactive", "overdue"),
      followupItem("outside-overdue", "staff-outside", "overdue"),
      followupItem("unowned-overdue", null, "overdue")
    ]
  });
  assertAction(
    overdue,
    "overdue-followups",
    ["overdue-first", "overdue-second"],
    "six-week-followup"
  );

  const escalated = await readWorklist({
    care: [
      careCandidate("escalated-first", "staff-active", {
        escalationLevel: "escalate"
      }),
      careCandidate("elevated-lower", "staff-active", {
        carePriority: "elevated"
      }),
      careCandidate("escalated-second", "staff-inactive", {
        escalationLevel: "escalate"
      }),
      careCandidate("stale-lower", "staff-active", {
        careAgeBucket: "stale"
      })
    ],
    followups: [followupItem("due-lower", "staff-active", "due")]
  });
  assertAction(
    escalated,
    "escalated-care",
    ["escalated-first", "escalated-second"],
    "care"
  );

  const elevated = await readWorklist({
    care: [
      careCandidate("elevated-first", "staff-active", {
        carePriority: "elevated"
      }),
      careCandidate("stale-lower", "staff-active", {
        careAgeBucket: "stale"
      }),
      careCandidate("elevated-second", "staff-pending", {
        carePriority: "elevated"
      })
    ],
    followups: [followupItem("due-lower", "staff-active", "due")]
  });
  assertAction(
    elevated,
    "elevated-care",
    ["elevated-first", "elevated-second"],
    "care"
  );

  const stale = await readWorklist({
    care: [
      careCandidate("stale-first", "staff-active", {
        careAgeBucket: "stale"
      }),
      careCandidate("stale-second", "staff-inactive", {
        careAgeBucket: "stale"
      })
    ],
    followups: [followupItem("due-lower", "staff-active", "due")]
  });
  assertAction(stale, "stale-care", ["stale-first", "stale-second"], "care");

  const due = await readWorklist({
    followups: [
      followupItem("due-first", "staff-active", "due"),
      followupItem("upcoming", "staff-active", "upcoming"),
      followupItem("due-second", "staff-pending", "due"),
      followupItem("outside-due", "staff-outside", "due"),
      followupItem("unowned-due", null, "due")
    ]
  });
  assertAction(due, "due-followups", ["due-first", "due-second"], "six-week-followup");

  const leaderOnly = await readWorklist({
    area: overview(linkedStaff, "staff-leader"),
    care: [careCandidate("leader-care", "staff-leader", {
      carePriority: "urgent"
    })],
    followups: [followupItem("leader-followup", "staff-leader", "overdue")]
  });
  assert.ok(leaderOnly);
  assert.equal(leaderOnly.recommendedFirstAction, null);
  assert.deepEqual(leaderOnly.items, []);

  const historicalLeader = await readWorklist({
    area: overview(linkedStaff, "staff-removed"),
    care: [careCandidate("removed-leader-care", "staff-removed", {
      carePriority: "urgent"
    })],
    followups: [followupItem("removed-leader-plan", "staff-removed", "overdue")]
  });
  assert.ok(historicalLeader);
  assert.equal(historicalLeader.recommendedFirstAction, null);
  assert.deepEqual(historicalLeader.items, []);

  for (const result of [urgent, overdue, escalated, elevated, stale, due]) {
    assert.ok(result);
    assert.equal(
      result.recommendedFirstAction?.count,
      result.items.length
    );
  }

  assert.deepEqual(Object.keys(urgent.items[0]).sort(), [
    "careAgeBucket",
    "carePriority",
    "escalationLevel",
    "kind",
    "ownerStaffId",
    "visitorId"
  ]);
  assert.deepEqual(Object.keys(due.items[0]).sort(), [
    "dueDate",
    "kind",
    "ownerStaffId",
    "taskStatus",
    "visitorId",
    "weekNumber"
  ]);
  const serialized = JSON.stringify({ urgent, due });
  for (const privateValue of [
    "email",
    "phone",
    "address",
    "birthday",
    "entraTenantId",
    "entraObjectId",
    "Private visitor name",
    "private@example.org",
    "555-0100",
    "private-opener-id",
    "Private follow-up notes"
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }

  console.log("ministryAreaRecommendedActionWorklist.test.ts passed");
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
});