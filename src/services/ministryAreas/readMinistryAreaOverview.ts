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

  const leaderStaffId = rosterResult.ministryArea.leaderStaffId;
  const readStaff =
    dependencies.readStaff ?? readCanonicalStaffDirectory;
  const leaderIdentity = leaderStaffId
    ? (await readStaff()).find(
        identity => identity.staffId === leaderStaffId
      ) ?? null
    : null;
  const roster = rosterResult.items;

  return {
    ministryArea: rosterResult.ministryArea,
    leader: leaderIdentity
      ? {
          staffId: leaderIdentity.staffId,
          displayName: leaderIdentity.displayName,
          roleLabel: leaderIdentity.roleLabel,
          status: leaderIdentity.status
        }
      : null,
    staffSummary: {
      total: roster.length,
      active: roster.filter(item => item.status === "active").length,
      pending: roster.filter(item => item.status === "pending").length,
      inactive: roster.filter(item => item.status === "inactive").length
    },
    roster
  };
}