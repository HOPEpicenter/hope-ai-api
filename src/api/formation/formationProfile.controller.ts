import { CanonicalFormationProfileReader } from "../../services/formation/canonicalFormationProfileReader";

export class FormationProfileController {
  constructor(private readonly reader: CanonicalFormationProfileReader) {}

  public async getProfile(memberId: string) {
    const result = await this.reader.readByMemberId(memberId);
    return result.hasQualifyingEvents ? result.profile : null;
  }

  public async getActivePathway(memberId: string) {
    return (await this.getProfile(memberId))?.activePathway ?? null;
  }

  public async getHistory(memberId: string) {
    return (await this.getProfile(memberId))?.history ?? [];
  }

  public async getStalledSteps(memberId: string) {
    return (await this.getProfile(memberId))?.stalledSteps ?? [];
  }
}