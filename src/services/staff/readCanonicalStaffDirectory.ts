import {
  projectStaffDirectory,
  type CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";
import {
  STAFF_IDENTITY_REGISTRY
} from "../operators/operatorIdentity";

export async function readCanonicalStaffDirectory(
  repo = new StaffEventsRepository()
): Promise<CanonicalStaffIdentity[]> {
  const events = await repo.listAll();

  return projectStaffDirectory(events);
}

export async function readCanonicalStaffIdentity(
  staffId: string,
  repo = new StaffEventsRepository()
): Promise<CanonicalStaffIdentity | null> {
  const normalized = String(staffId ?? "").trim();

  if (!normalized) {
    return null;
  }

  return (
    (await readCanonicalStaffDirectory(repo)).find(
      item => item.staffId === normalized
    ) ?? null
  );
}

export async function readMutationActorStaffIdentity(
  staffId: string,
  repo = new StaffEventsRepository()
): Promise<CanonicalStaffIdentity | null> {
  const normalized = String(staffId ?? "").trim();

  if (!normalized) {
    return null;
  }

  const canonical = await readCanonicalStaffIdentity(
    normalized,
    repo
  );

  if (canonical) {
    return canonical;
  }

  const compatibilityIdentity =
    STAFF_IDENTITY_REGISTRY.find(
      item => item.staffId === normalized
    );

  if (!compatibilityIdentity) {
    return null;
  }

  return {
    staffId: compatibilityIdentity.staffId,
    displayName: compatibilityIdentity.displayName,
    roleLabel: compatibilityIdentity.roleLabel,
    status: "active",
    createdAt: null,
    updatedAt: null,
    lastEventId: null
  };
}
