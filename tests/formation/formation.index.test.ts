import { FormationIndex } from "../../src/domain/formation/formation.index";
import type { FormationProjectionState } from "../../src/domain/formation/formation.projection";

const state: FormationProjectionState = {
  lastUpdatedAt: "2026-09-02T00:00:00.000Z",
  pathways: [
    {
      pathwayId: "active",
      memberId: "member-1",
      pathwayType: "new-believer",
      startedAt: "2026-09-01T00:00:00.000Z",
      status: "in_progress",
      currentStepId: "welcome",
      steps: [{ stepId: "welcome" }],
    },
    {
      pathwayId: "completed",
      memberId: "member-2",
      pathwayType: "membership",
      startedAt: "2026-09-01T00:00:00.000Z",
      completedAt: "2026-09-02T00:00:00.000Z",
      status: "completed",
      currentStepId: "commissioned",
      steps: [{ stepId: "commissioned" }],
    },
    {
      pathwayId: "stalled",
      memberId: "member-1",
      pathwayType: "membership",
      startedAt: "2026-09-01T00:00:00.000Z",
      status: "stalled",
      currentStepId: "group",
      steps: [{ stepId: "group", reason: "No response" }],
    },
  ],
};

describe("FormationIndex", () => {
  it("filters projected pathways and returns copies of pathway steps", () => {
    const index = new FormationIndex(state);

    expect(index.getPathwaysForMember("member-1").map(({ pathwayId }) => pathwayId)).toEqual([
      "active",
      "stalled",
    ]);
    expect(index.getActivePathways().map(({ pathwayId }) => pathwayId)).toEqual([
      "active",
    ]);
    expect(index.getCompletedPathways().map(({ pathwayId }) => pathwayId)).toEqual([
      "completed",
    ]);
    expect(index.getStalledPathways().map(({ pathwayId }) => pathwayId)).toEqual([
      "stalled",
    ]);
    expect(index.getAllPathways()).toHaveLength(3);
    expect(index.getStepsForPathway("completed")).toEqual([
      { stepId: "commissioned" },
    ]);
    expect(index.getStepsForPathway("missing")).toEqual([]);
    expect(index.getLastUpdatedAt()).toBe("2026-09-02T00:00:00.000Z");
  });

  it("returns defensive copies from read queries", () => {
    const index = new FormationIndex(state);
    const pathways = index.getAllPathways();
    pathways[0]!.steps[0]!.stepId = "changed";

    expect(index.getStepsForPathway("active")).toEqual([{ stepId: "welcome" }]);
  });
});