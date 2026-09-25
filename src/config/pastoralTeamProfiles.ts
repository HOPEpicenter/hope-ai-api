/**
 * Non-personal, deterministic defaults for local planning and API availability.
 * Production callers may supply their own profiles; these identifiers are roles,
 * never names or identity records.
 */
export type PastoralTeamProfile = {
  pastorId: string;
  strengths: readonly string[];
  capacity: number;
  currentLoad: number;
};

export const defaultPastoralTeamProfiles: readonly PastoralTeamProfile[] = [
  { pastorId: "pastor-care", strengths: ["care", "crisis", "support"], capacity: 12, currentLoad: 0 },
  { pastorId: "pastor-formation", strengths: ["growth", "formation", "discipleship"], capacity: 12, currentLoad: 0 },
  { pastorId: "pastor-leadership", strengths: ["leadership", "serving", "community"], capacity: 12, currentLoad: 0 }
];