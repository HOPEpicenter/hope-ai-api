import type {
  CanonicalMinistryArea
} from "../../domain/ministryAreas/projectMinistryAreas";
import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  readCanonicalStaffDirectory
} from "../staff/readCanonicalStaffDirectory";
import {
  readMinistryAreaStaffRoster,
  type MinistryAreaStaffRoster,
  type MinistryAreaStaffRosterItem
} from "./readMinistryAreaStaffRoster";

export type MinistryAreaOverview = {
  ministryArea: CanonicalMinistryArea;
  leader: Pick<
    CanonicalStaffIdentity,
    "staffId" | "displayName" | "roleLabel" | "status"
  > | null;
  leaders: Array<
    Pick<CanonicalStaffIdentity, "staffId" | "displayName" | "roleLabel" | "status">
  >;
  staffSummary: {
    total: number;
    active: number;
    pending: number;
    inactive: number;
  };
  roster: MinistryAreaStaffRosterItem[];
};

export type MinistryAreaOverviewDependencies = {
  readRoster?: (
    ministryAreaId: string
  ) => Promise<MinistryAreaStaffRoster | null>;
  readStaff?: () => Promise<CanonicalStaffIdentity[]>;
};

export async function readMinistryAreaOverview(
  ministryAreaId: string,
  dependencies: MinistryAreaOverviewDependencies = {}
): Promise<MinistryAreaOverview | null> {
  const normalizedId = String(ministryAreaId ?? "").trim();

  if (!normalizedId) {
    return null;
  }

  const readRoster =
    dependencies.readRoster ?? readMinistryAreaStaffRoster;
  const rosterResult = await readRoster(normalizedId);

  if (!rosterResult) {
    return null;
  }

  const leaderStaffIds = rosterResult.ministryArea.leaderStaffIds;
  const leaderStaffId = rosterResult.ministryArea.leaderStaffId;
  const readStaff =
    dependencies.readStaff ?? readCanonicalStaffDirectory;
  const staffDirectory =
    leaderStaffIds.length > 0 ? await readStaff() : [];

  function resolveLeaderIdentity(staffId: string) {
    const identity = staffDirectory.find(
      candidate => candidate.staffId === staffId
    );

    return identity
      ? {
          staffId: identity.staffId,
          displayName: identity.displayName,
          roleLabel: identity.roleLabel,
          status: identity.status
        }
      : null;
  }

  const leaders = leaderStaffIds
    .map(resolveLeaderIdentity)
    .filter(
      (identity): identity is NonNullable<typeof identity> => identity !== null
    );
  const leaderIdentity = leaderStaffId
    ? resolveLeaderIdentity(leaderStaffId)
    : null;
  const roster = rosterResult.items;

  return {
    ministryArea: rosterResult.ministryArea,
    leader: leaderIdentity,
    leaders,
    staffSummary: {
      total: roster.length,
      active: roster.filter(item => item.status === "active").length,
      pending: roster.filter(item => item.status === "pending").length,
      inactive: roster.filter(item => item.status === "inactive").length
    },
    roster
  };
}