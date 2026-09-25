import { defaultPastoralTeamProfiles, type PastoralTeamProfile } from "../../config/pastoralTeamProfiles";
import { assignPastoralWorkload } from "../../domain/workloadOptimization/workload.assignment";
import { buildPastoralWorkloadInputs, type WorkloadFusionInput } from "../../domain/workloadOptimization/workload.inputs";
import { rankPastoralWorkload } from "../../domain/workloadOptimization/workload.ranking";
import { buildPastoralWorkloadLeadershipSummary, buildPastoralWorkloadReport, type PastoralWorkloadReport } from "../../domain/workloadOptimization/workload.report";
import { schedulePastoralWorkload } from "../../domain/workloadOptimization/workload.schedule";

const defaultFusionInput: WorkloadFusionInput = {
  predictiveMemberIntelligence: [],
  ministryHealthAnalytics: { overallScore: 100, status: "healthy", scoresByDomain: {}, alertCount: 0, trendCounts: {} }
};

export class WorkloadOptimizationController {
  /** Computes a plan from caller-provided fusion inputs and optional role profiles. */
  createPlan(input: WorkloadFusionInput = defaultFusionInput, profiles: readonly PastoralTeamProfile[] = defaultPastoralTeamProfiles): PastoralWorkloadReport {
    const rankings = rankPastoralWorkload(buildPastoralWorkloadInputs(input));
    const assignments = assignPastoralWorkload(rankings, profiles);
    return buildPastoralWorkloadReport(rankings, assignments, schedulePastoralWorkload(assignments));
  }

  getMember(memberId: string) {
    const plan = this.createPlan();
    return plan.schedule.find((item) => item.memberId === memberId) ?? null;
  }

  getPastor(pastorId: string) {
    return this.createPlan().schedule.filter((item) => item.pastorId === pastorId);
  }

  getLeadershipSummary() {
    return buildPastoralWorkloadLeadershipSummary(this.createPlan().assignments);
  }

  getLeadershipReport() {
    return this.createPlan();
  }
}