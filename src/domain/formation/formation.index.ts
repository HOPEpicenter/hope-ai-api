import type { FormationProjectionState } from "./formation.projection";

export class FormationIndex {
  constructor(private readonly state: FormationProjectionState) {}

  public getAllPathways(): Array<{
    pathwayId: string;
    memberId: string;
    pathwayType: string;
    startedAt: string;
    completedAt?: string;
    status: "in_progress" | "stalled" | "completed";
    currentStepId: string;
    steps: Array<{
      stepId: string;
      completedAt?: string;
      stalledSince?: string;
      notes?: string;
      reason?: string;
    }>;
  }> {
    return this.state.pathways.map(pathway => ({
      ...pathway,
      steps: pathway.steps.map(step => ({ ...step })),
    }));
  }

  public getPathwaysForMember(
    memberId: string
  ): ReturnType<FormationIndex["getAllPathways"]> {
    return this.getAllPathways().filter(
      pathway => pathway.memberId === memberId
    );
  }

  public getActivePathways(): ReturnType<
    FormationIndex["getAllPathways"]
  > {
    return this.getAllPathways().filter(
      pathway => pathway.status === "in_progress"
    );
  }

  public getStalledPathways(): ReturnType<
    FormationIndex["getAllPathways"]
  > {
    return this.getAllPathways().filter(
      pathway => pathway.status === "stalled"
    );
  }

  public getCompletedPathways(): ReturnType<
    FormationIndex["getAllPathways"]
  > {
    return this.getAllPathways().filter(
      pathway => pathway.status === "completed"
    );
  }

  public getStepsForPathway(pathwayId: string): Array<{
    stepId: string;
    completedAt?: string;
    stalledSince?: string;
    notes?: string;
    reason?: string;
  }> {
    const pathway = this.state.pathways.find(
      candidate => candidate.pathwayId === pathwayId
    );

    return pathway ? pathway.steps.map(step => ({ ...step })) : [];
  }

  public getLastUpdatedAt(): string | null {
    return this.state.lastUpdatedAt;
  }
}