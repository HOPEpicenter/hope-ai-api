import assert from "node:assert/strict";
import {
  composeMorningBriefing,
  MORNING_BRIEFING_CARE_TARGET_LIMIT,
  type MorningBriefingCompositionInput
} from "../../src/services/intelligence/morningBriefingService";
import type {
  CanonicalMorningBriefingCareCandidate
} from "../../src/services/intelligence/readCanonicalActivityIntelligence";

function careCandidate(
  visitorId: string,
  input: Partial<CanonicalMorningBriefingCareCandidate> = {}
): CanonicalMorningBriefingCareCandidate {
  return {
    visitorId,
    displayName: `Person ${visitorId}`,
    reason: "needs_care",
    carePriority: "normal",
    assignmentState: "assigned",
    assignmentBucket: "owned",
    ...input
  };
}

const baseInput: MorningBriefingCompositionInput = {
  intelligence: {
    generatedAt: "2026-09-15T08:00:00.000Z",
    operationalHealth: {
      status: "healthy",
      reasons: []
    },
    careLoad: {
      totalCandidates: 0,
      urgentCount: 0,
      staleCount: 0,
      escalationCount: 0,
      assignedCount: 0,
      unassignedCount: 0,
      ownedCount: 0,
      queueCount: 0
    },
    followups: {
      total: 0,
      resolved: 0,
      escalated: 0,
      overdue: 0,
      atRisk: 0,
      onTrack: 0
    },
    formation: {
      totalProfiles: 0,
      byStage: {},
      projectedJourney: {
        guest: 0,
        connected: 0,
        growing: 0,
        serving: 0,
        member: 0
      },
      milestoneSignals: {
        nextStepSelected: 0,
        nextStepCompleted: 0,
        connectedOutcomes: 0,
        activeCareRelationships: 0,
        groupParticipation: 0
      },
      cohorts: {
        connectedWithoutNextStep: 0,
        connectedWithoutCareOwner: 0,
        nextStepSelectedNotCompleted: 0,
        activeCareWithoutOutcome: 0
      },
      opportunities: {
        highestPriority: null,
        items: []
      }
    }
  }
};

{
  const result = composeMorningBriefing(baseInput);

  assert.equal(result.complete, true);
  assert.equal(result.decision.status, "clear");
  assert.equal(result.decision.firstAction, null);
  assert.deepEqual(result.decision.actions, []);
}

{
  const result = composeMorningBriefing({
    ...baseInput,
    intelligence: {
      ...baseInput.intelligence,
      operationalHealth: {
        status: "attention",
        reasons: ["1 overdue followup(s)"]
      },
      careLoad: {
        ...baseInput.intelligence.careLoad,
        urgentCount: 2,
        unassignedCount: 3,
        assignedCount: 4,
        ownedCount: 4,
        queueCount: 3
      },
      followups: {
        ...baseInput.intelligence.followups,
        total: 8,
        overdue: 1,
        atRisk: 2
      },
      formation: {
        ...baseInput.intelligence.formation,
        totalProfiles: 12,
        opportunities: {
          highestPriority: null,
          items: [
            {
              key: "CONNECTED_WITHOUT_NEXT_STEP",
              label: "Connected people without next step",
              count: 5,
              priority: "high",
              drilldown: {
                surface: "formation-profiles",
                segment: "connected-without-next-step",
                href: "/formation-profiles?segment=connected-without-next-step"
              }
            }
          ]
        }
      }
    },
    careCandidates: [
      careCandidate("urgent-unassigned", {
        displayName: "Urgent Unassigned",
        carePriority: "urgent",
        assignmentState: "unassigned",
        assignmentBucket: "queue"
      }),
      careCandidate("urgent-owned", {
        displayName: "Urgent Owned",
        carePriority: "urgent"
      }),
      careCandidate("normal-unassigned-1", {
        displayName: "Normal Unassigned One",
        assignmentState: "unassigned",
        assignmentBucket: "queue"
      }),
      careCandidate("normal-unassigned-2", {
        displayName: "Normal Unassigned Two",
        assignmentState: "unassigned",
        assignmentBucket: "queue"
      })
    ]
  });

  assert.equal(result.decision.status, "attention");
  assert.equal(result.decision.firstAction?.key, "urgent-care");
  assert.equal(result.decision.firstAction?.label, "Review urgent operational care signals");
  assert.equal(
    result.decision.firstAction?.reason,
    "2 urgent care candidate(s) are in the Activity Intelligence care load."
  );
  assert.equal(result.decision.firstAction?.source, "activity-intelligence");
  assert.equal(result.decision.firstAction?.sourcePath, "/api/activity-intelligence");
  assert.deepEqual(result.decision.firstAction?.primaryTarget, {
    visitorId: "urgent-unassigned",
    displayName: "Urgent Unassigned",
    reason: "Needs care",
    personPath: "/people?visitorId=urgent-unassigned"
  });
  assert.deepEqual(
    result.decision.actions.map((item) => item.key),
    [
      "urgent-care",
      "overdue-followups",
      "unassigned-care",
      "at-risk-followups",
      "opportunity-connected_without_next_step"
    ]
  );
  const unassignedAction = result.decision.actions.find(
    (item) => item.key === "unassigned-care"
  );
  assert.equal(unassignedAction?.source, "activity-intelligence");
  assert.equal(unassignedAction?.sourcePath, "/api/activity-intelligence");
  assert.equal(result.care.urgentCount, 2);
  assert.equal(result.followups.overdue, 1);
  assert.equal(result.ownership.queueCount, 3);
  assert.equal(result.activity.formation.opportunities.items[0]?.count, 5);
  assert.deepEqual(
    result.care.lanes.map((lane) => ({
      key: lane.key,
      label: lane.label,
      count: lane.count,
      targetIds: lane.targets.map((target) => target.visitorId),
      additionalTargetCount: lane.additionalTargetCount
    })),
    [
      {
        key: "urgent-care",
        label: "Urgent care",
        count: 2,
        targetIds: ["urgent-unassigned", "urgent-owned"],
        additionalTargetCount: 0
      },
      {
        key: "unassigned-care",
        label: "Unassigned care",
        count: 3,
        targetIds: [
          "urgent-unassigned",
          "normal-unassigned-1",
          "normal-unassigned-2"
        ],
        additionalTargetCount: 0
      },
      {
        key: "shared-care-queue",
        label: "Shared care queue",
        count: 3,
        targetIds: [
          "urgent-unassigned",
          "normal-unassigned-1",
          "normal-unassigned-2"
        ],
        additionalTargetCount: 0
      }
    ]
  );
}

{
  const result = composeMorningBriefing({
    ...baseInput,
    sourceStatus: {
      followups: "unavailable"
    }
  });

  assert.equal(result.complete, false);
  assert.equal(result.decision.status, "unavailable");
  assert.equal(result.decision.firstAction, null);
  assert.deepEqual(result.decision.actions, []);
  assert.equal(result.sources.followups, "unavailable");
}

{
  const candidates = Array.from(
    { length: MORNING_BRIEFING_CARE_TARGET_LIMIT + 2 },
    (_, index) => careCandidate(`queue-${index + 1}`, {
      assignmentState: "unassigned",
      assignmentBucket: "queue"
    })
  );

  const count = candidates.length;
  const result = composeMorningBriefing({
    ...baseInput,
    intelligence: {
      ...baseInput.intelligence,
      careLoad: {
        ...baseInput.intelligence.careLoad,
        totalCandidates: count,
        unassignedCount: count,
        queueCount: count
      }
    },
    careCandidates: candidates
  });

  const unassignedLane = result.care.lanes.find(
    (lane) => lane.key === "unassigned-care"
  );
  const sharedQueueLane = result.care.lanes.find(
    (lane) => lane.key === "shared-care-queue"
  );

  assert.equal(
    unassignedLane?.targets.length,
    MORNING_BRIEFING_CARE_TARGET_LIMIT
  );
  assert.equal(unassignedLane?.additionalTargetCount, 2);
  assert.deepEqual(
    unassignedLane?.targets.map((target) => target.visitorId),
    ["queue-1", "queue-2", "queue-3", "queue-4", "queue-5"]
  );
  assert.equal(sharedQueueLane?.label, "Shared care queue");
  assert.equal(sharedQueueLane?.additionalTargetCount, 2);
}

console.log("morningBriefingService.test.ts passed");