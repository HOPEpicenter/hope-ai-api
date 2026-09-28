import type {
  CanonicalMinistryArea
} from "../../domain/ministryAreas/projectMinistryAreas";
import type {
  CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import {
  readMinistryAreas
} from "./ministryAreaCommands";
import {
  readCanonicalStaffDirectory
} from "../staff/readCanonicalStaffDirectory";

export type MinistryAreaStaffRosterItem = Pick<
  CanonicalStaffIdentity,
  | "staffId"
  | "displayName"
  | "roleLabel"
  | "status"
  | "ministryAreaId"
>;

export type MinistryAreaStaffRoster = {
  ministryArea: CanonicalMinistryArea;
  items: MinistryAreaStaffRosterItem[];
};

export type MinistryAreaStaffRosterDependencies = {
  readAreas?: () => Promise<CanonicalMinistryArea[]>;
  readStaff?: () => Promise<CanonicalStaffIdentity[]>;
};

export async function readMinistryAreaStaffRoster(
  ministryAreaId: string,
  dependencies: MinistryAreaStaffRosterDependencies = {}
): Promise<MinistryAreaStaffRoster | null> {
  const normalizedId = String(ministryAreaId ?? "").trim();

  if (!normalizedId) {
    return null;
  }

  const readAreas =
    dependencies.readAreas ?? readMinistryAreas;

  const readStaff =
    dependencies.readStaff ?? readCanonicalStaffDirectory;

  const areas = await readAreas();

  const ministryArea =
    areas.find(
      area => area.ministryAreaId === normalizedId
    ) ?? null;

  if (!ministryArea) {
    return null;
  }

  const staff = await readStaff();

  const items = staff
    .filter(
      identity =>
        identity.ministryAreaId === normalizedId
    )
    .map(identity => ({
      staffId: identity.staffId,
      displayName: identity.displayName,
      roleLabel: identity.roleLabel,
      status: identity.status,
      ministryAreaId: identity.ministryAreaId
    }))
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName) ||
        a.staffId.localeCompare(b.staffId)
    );

  return {
    ministryArea,
    items
  };
}
