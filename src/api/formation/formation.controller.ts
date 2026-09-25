import {
  type CompletePathwayCommand,
  type CompleteStepCommand,
  type DetectStepStalledCommand,
  type StartPathwayCommand,
} from "../../domain/formation/formation.commands";
import { FormationEventBusAdapter } from "../../domain/formation/formation.eventBusAdapter";
import { FormationIndex } from "../../domain/formation/formation.index";
import { FormationProjection } from "../../domain/formation/formation.projection";

export class FormationController {
  constructor(
    private readonly adapter: FormationEventBusAdapter,
    private readonly projection: FormationProjection
  ) {}

  public async startPathway(cmd: StartPathwayCommand) {
    const { event, state } = await this.adapter.startPathwayAndPublish(cmd);
    this.projection.apply(event);
    return { event, state };
  }

  public async completeStep(cmd: CompleteStepCommand) {
    const { event, state } = await this.adapter.completeStepAndPublish(cmd);
    this.projection.apply(event);
    return { event, state };
  }

  public async detectStepStalled(cmd: DetectStepStalledCommand) {
    const { event, state } = await this.adapter.detectStepStalledAndPublish(cmd);
    this.projection.apply(event);
    return { event, state };
  }

  public async completePathway(cmd: CompletePathwayCommand) {
    const { event, state } = await this.adapter.completePathwayAndPublish(cmd);
    this.projection.apply(event);
    return { event, state };
  }

  public getAllPathways() {
    return new FormationIndex(this.projection.getState()).getAllPathways();
  }

  public getPathwaysForMember(memberId: string) {
    return new FormationIndex(this.projection.getState()).getPathwaysForMember(
      memberId
    );
  }

  public getActivePathways() {
    return new FormationIndex(this.projection.getState()).getActivePathways();
  }

  public getStalledPathways() {
    return new FormationIndex(this.projection.getState()).getStalledPathways();
  }

  public getCompletedPathways() {
    return new FormationIndex(this.projection.getState()).getCompletedPathways();
  }

  public getStepsForPathway(pathwayId: string) {
    return new FormationIndex(this.projection.getState()).getStepsForPathway(
      pathwayId
    );
  }
}