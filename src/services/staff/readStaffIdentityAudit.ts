import type {
  StaffEvent,
  StaffEventData,
  StaffEventType
} from "../../domain/staff/projectStaffDirectory";
import { projectStaffDirectory } from "../../domain/staff/projectStaffDirectory";
import { StaffEventsRepository } from "../../repositories/staffEventsRepository";

export type StaffIdentityAuditEntry = {
  eventId: string;
  type: StaffEventType;
  occurredAt: string;
  actorId: string;
  actorDisplayName: string | null;
  changes: {
    displayName?: string;
    roleLabel?: string | null;
    status?: string;
    reason?: string | null;
    entraBindingChanged: boolean;
  };
};

function toAuditEntry(
  event: StaffEvent,
  actorDisplayName: string | null
): StaffIdentityAuditEntry {
  const data: StaffEventData = event.data;

  return {
    eventId: event.eventId,
    type: event.type,
    occurredAt: event.occurredAt,
    actorId: event.actorId,
    actorDisplayName,
    changes: {
      ...(data.displayName === undefined
        ? {}
        : { displayName: data.displayName }),
      ...(data.roleLabel === undefined
        ? {}
        : { roleLabel: data.roleLabel }),
      ...(data.status === undefined
        ? {}
        : { status: data.status }),
      ...(data.reason === undefined
        ? {}
        : { reason: data.reason }),
      entraBindingChanged:
        data.entraTenantId !== undefined ||
        data.entraObjectId !== undefined
    }
  };
}

export async function readStaffIdentityAudit(
  staffId: string,
  repo = new StaffEventsRepository()
): Promise<StaffIdentityAuditEntry[]> {
  const normalizedStaffId = String(staffId ?? "").trim();

  if (!normalizedStaffId) {
    return [];
  }

  const events = await repo.listAll();
  const actorDisplayNames = new Map(
    projectStaffDirectory(events).map(identity => [
      identity.staffId,
      identity.displayName
    ])
  );


  return events
    .filter(event => event.staffId === normalizedStaffId)
    .sort(
      (left, right) =>
        right.occurredAt.localeCompare(left.occurredAt) ||
        right.eventId.localeCompare(left.eventId)
    )
    .map(event => toAuditEntry(
      event,
      actorDisplayNames.get(event.actorId) ?? null
    ));
}
