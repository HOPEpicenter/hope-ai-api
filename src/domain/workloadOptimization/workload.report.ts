import type { PastoralWorkloadAssignment } from "./workload.assignment";
import type { PastoralWorkloadRanking } from "./workload.ranking";
import type { PastoralWorkloadSchedule } from "./workload.schedule";

export type PastoralWorkloadLeadershipSummary = {
  totalMembers: number;
  assignedCount: number;
  unassignedCount: number;
  urgentCount: number;
  byPastor: Record<string, number>;
};

export type PastoralWorkloadReport = {
  summary: PastoralWorkloadLeadershipSummary;
  rankings: readonly PastoralWorkloadRanking[];
  assignments: readonly PastoralWorkloadAssignment[];
  schedule: readonly PastoralWorkloadSchedule[];
};

export function buildPastoralWorkloadLeadershipSummary(assignments: readonly PastoralWorkloadAssignment[]): PastoralWorkloadLeadershipSummary {
  const byPastor: Record<string, number> = {};
  for (const assignment of assignments) {
    if (assignment.pastorId) byPastor[assignment.pastorId] = (byPastor[assignment.pastorId] ?? 0) + 1;
  }
  return {
    totalMembers: assignments.length,
    assignedCount: assignments.filter((assignment) => assignment.status === "assigned").length,
    unassignedCount: assignments.filter((assignment) => assignment.status === "unassigned").length,
    urgentCount: assignments.filter((assignment) => assignment.priority === "urgent").length,
    byPastor
  };
}

export function buildPastoralWorkloadReport(
  rankings: readonly PastoralWorkloadRanking[],
  assignments: readonly PastoralWorkloadAssignment[],
  schedule: readonly PastoralWorkloadSchedule[]
): PastoralWorkloadReport {
  return { summary: buildPastoralWorkloadLeadershipSummary(assignments), rankings, assignments, schedule };
}