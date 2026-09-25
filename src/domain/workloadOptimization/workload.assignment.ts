import type { PastoralTeamProfile } from "../../config/pastoralTeamProfiles";
import type { PastoralWorkloadRanking } from "./workload.ranking";

export type PastoralWorkloadAssignment = {
  memberId: string;
  pastorId: string | null;
  priority: PastoralWorkloadRanking["priority"];
  primaryDriver: string;
  loadImpact: number | null;
  status: "assigned" | "unassigned";
};

function matchesStrength(profile: PastoralTeamProfile, drivers: readonly string[]): boolean {
  return drivers.some((driver) => profile.strengths.some((strength) =>
    strength.toLowerCase().includes(driver.toLowerCase()) || driver.toLowerCase().includes(strength.toLowerCase())
  ));
}

/**
 * Assigns only to profiles that started below capacity or retain capacity after
 * earlier assignments. A null pastorId means every available profile is exhausted.
 */
export function assignPastoralWorkload(
  rankings: readonly PastoralWorkloadRanking[],
  profiles: readonly PastoralTeamProfile[]
): PastoralWorkloadAssignment[] {
  const loads = new Map(profiles.map((profile) => [profile.pastorId, profile.currentLoad]));
  const profileById = new Map(profiles.map((profile) => [profile.pastorId, profile]));
  const ordered = [...rankings].sort((left, right) => right.priorityScore - left.priorityScore || left.memberId.localeCompare(right.memberId));

  return ordered.map((ranking) => {
    const available = profiles.filter((profile) => (loads.get(profile.pastorId) ?? profile.currentLoad) < profile.capacity);
    const matching = available.filter((profile) => matchesStrength(profile, ranking.driverWords));
    const candidates = matching.length > 0 ? matching : available;
    const selected = [...candidates].sort((left, right) => {
      const leftLoad = loads.get(left.pastorId) ?? left.currentLoad;
      const rightLoad = loads.get(right.pastorId) ?? right.currentLoad;
      const leftImpact = (leftLoad + 1) / left.capacity;
      const rightImpact = (rightLoad + 1) / right.capacity;
      return leftImpact - rightImpact || left.pastorId.localeCompare(right.pastorId);
    })[0];
    if (!selected) {
      return { memberId: ranking.memberId, pastorId: null, priority: ranking.priority, primaryDriver: ranking.primaryDriver, loadImpact: null, status: "unassigned" };
    }
    const currentLoad = loads.get(selected.pastorId) ?? selected.currentLoad;
    loads.set(selected.pastorId, currentLoad + 1);
    const profile = profileById.get(selected.pastorId)!;
    return {
      memberId: ranking.memberId,
      pastorId: selected.pastorId,
      priority: ranking.priority,
      primaryDriver: ranking.primaryDriver,
      loadImpact: (currentLoad + 1) / profile.capacity,
      status: "assigned"
    };
  });
}