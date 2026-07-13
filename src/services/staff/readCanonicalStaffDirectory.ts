import {
  projectStaffDirectory,
  type CanonicalStaffIdentity
} from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";

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
