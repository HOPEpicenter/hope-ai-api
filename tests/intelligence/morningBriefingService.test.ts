import assert from "node:assert/strict";
import {
  composeMorningBriefing,
  type MorningBriefingCompositionInput
} from "../../src/services/intelligence/morningBriefingService";

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
    }
  });

  assert.equal(result.decision.status, "attention");
  assert.equal(result.decision.firstAction?.key, "urgent-care");
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
  assert.equal(result.care.urgentCount, 2);
  assert.equal(result.followups.overdue, 1);
  assert.equal(result.ownership.queueCount, 3);
  assert.equal(result.activity.formation.opportunities.items[0]?.count, 5);
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

console.log("morningBriefingService.test.ts passed");