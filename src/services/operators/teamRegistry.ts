export const TEAM_REGISTRY = [
  {
    teamId: "ops",
    displayName: "Operations Team"
  },
  {
    teamId: "care",
    displayName: "Care Team"
  }
] as const;

export function listKnownTeams() {
  return [...TEAM_REGISTRY];
}