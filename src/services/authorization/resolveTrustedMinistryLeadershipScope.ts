import type { CanonicalMinistryArea } from "../../domain/ministryAreas/projectMinistryAreas";

/**
 * Derives ministry leadership scope solely from trusted canonical area records.
 *
 * The staff ID must already have been established by verified authentication
 * and canonical staff resolution. Neither caller-provided role labels nor
 * staff ministry affiliation establish leadership authority.
 *
 * No HTTP authorization or storage access occurs in this function.
 */
export function resolveTrustedMinistryLeadershipScope(
  verifiedStaffId: string,
  areas: readonly CanonicalMinistryArea[]
): string[] {
  if (
    typeof verifiedStaffId !== "string" ||
    !verifiedStaffId.trim() ||
    verifiedStaffId !== verifiedStaffId.trim() ||
    !Array.isArray(areas)
  ) {
    return [];
  }

  const result: string[] = [];
  const counts = new Map<string, number>();

  for (const area of areas) {
    if (
      area &&
      typeof area.ministryAreaId === "string" &&
      area.ministryAreaId.trim()
    ) {
      const id = area.ministryAreaId.trim();
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }

  for (const area of areas) {
    if (
      !area ||
      area.status !== "active" ||
      typeof area.ministryAreaId !== "string" ||
      !area.ministryAreaId.trim() ||
      area.ministryAreaId !== area.ministryAreaId.trim() ||
      !Array.isArray(area.leaderStaffIds)
    ) {
      continue;
    }

    if (
      !area.leaderStaffIds.every(
        (id: unknown) =>
          typeof id === "string" &&
          !!id.trim() &&
          id === id.trim()
      ) ||
      new Set(area.leaderStaffIds).size !== area.leaderStaffIds.length ||
      !area.leaderStaffIds.includes(verifiedStaffId)
    ) {
      continue;
    }

    if (counts.get(area.ministryAreaId) === 1) {
      result.push(area.ministryAreaId);
    }
  }

  return result;
}
