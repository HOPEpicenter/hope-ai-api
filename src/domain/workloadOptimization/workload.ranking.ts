import type { PastoralWorkloadInput } from "./workload.inputs";

export type WorkloadPriority = "urgent" | "high" | "medium" | "low";
export type WorkloadDriver = "care" | "stall" | "growth" | "leadership" | "complexity";

export type PastoralWorkloadRanking = {
  memberId: string;
  priority: WorkloadPriority;
  priorityScore: number;
  primaryDriver: WorkloadDriver;
  driverWords: readonly string[];
  rationale: string;
};

const DRIVER_SCORES: readonly [WorkloadDriver, keyof Pick<PastoralWorkloadInput, "careNeedScore" | "stallRiskScore" | "growthPotentialScore" | "leadershipPotentialScore" | "pastoralComplexityScore">][] = [
  ["care", "careNeedScore"],
  ["stall", "stallRiskScore"],
  ["growth", "growthPotentialScore"],
  ["leadership", "leadershipPotentialScore"],
  ["complexity", "pastoralComplexityScore"]
];

function priorityFor(score: number): WorkloadPriority {
  if (score >= 0.8) return "urgent";
  if (score >= 0.6) return "high";
  if (score >= 0.4) return "medium";
  return "low";
}

/** Ranks by fused priority, then member id, with stable care-first driver ties. */
export function rankPastoralWorkload(inputs: readonly PastoralWorkloadInput[]): PastoralWorkloadRanking[] {
  return inputs.map((input) => {
    const drivers = [...DRIVER_SCORES].sort((left, right) =>
      input[right[1]] - input[left[1]] || DRIVER_SCORES.indexOf(left) - DRIVER_SCORES.indexOf(right)
    );
    const primaryDriver = drivers[0]![0];
    const driverWords = drivers
      .filter(([, key]) => input[key] > 0)
      .map(([driver]) => driver === "stall" ? "stall" : driver);
    return {
      memberId: input.memberId,
      priority: priorityFor(input.priorityScore),
      priorityScore: input.priorityScore,
      primaryDriver,
      driverWords,
      rationale: `${primaryDriver} is the strongest workload signal at ${input[drivers[0]![1]].toFixed(2)}.`
    };
  }).sort((left, right) => right.priorityScore - left.priorityScore || left.memberId.localeCompare(right.memberId));
}