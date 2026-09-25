import { FormationProfileIndex } from "../../domain/formation/formationProfile.index";

export class FormationProfileController {
  constructor(private readonly profiles: FormationProfileIndex) {}

  public getProfile(memberId: string) {
    return this.profiles.getProfile(memberId);
  }

  public getActivePathway(memberId: string) {
    return this.profiles.getProfile(memberId)?.activePathway ?? null;
  }

  public getHistory(memberId: string) {
    return this.profiles.getProfile(memberId)?.history ?? [];
  }

  public getStalledSteps(memberId: string) {
    return this.profiles.getProfile(memberId)?.stalledSteps ?? [];
  }
}