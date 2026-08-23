import type {
  StaffStatus
} from "../../services/operators/operatorIdentity";

export type StaffEventType =
  | "staff.created"
  | "staff.updated"
  | "staff.deactivated";

export type StaffEventData = {
  displayName?: string;
  roleLabel?: string | null;
  status?: StaffStatus;
  reason?: string | null;
  entraTenantId?: string | null;
  entraObjectId?: string | null;
};

export type StaffEvent = {
  eventId: string;
  staffId: string;
  type: StaffEventType;
  occurredAt: string;
  actorId: string;
  data: StaffEventData;
};

export type CanonicalStaffIdentity = {
  staffId: string;
  displayName: string;
  roleLabel: string | null;
  status: StaffStatus;
  createdAt: string | null;
  updatedAt: string | null;
  lastEventId: string | null;
  entraTenantId: string | null;
  entraObjectId: string | null;
};

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function normalizeEntraStaffBinding(
  entraTenantId: unknown,
  entraObjectId: unknown
): { entraTenantId: string; entraObjectId: string } | null {
  const tenantId = normalizeText(entraTenantId).toLowerCase();
  const objectId = normalizeText(entraObjectId).toLowerCase();

  if (!GUID_PATTERN.test(tenantId) || !GUID_PATTERN.test(objectId)) {
    return null;
  }

  return { entraTenantId: tenantId, entraObjectId: objectId };
}

export function projectStaffDirectory(
  events: StaffEvent[]
): CanonicalStaffIdentity[] {
  const records = new Map<string, CanonicalStaffIdentity>();


  const ordered = [...events].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt) ||
    a.eventId.localeCompare(b.eventId)
  );

  for (const event of ordered) {
    if (event.type === "staff.created") {
      const displayName = normalizeText(event.data.displayName);

      if (!displayName || records.has(event.staffId)) {
        continue;
      }

      const entraBinding = normalizeEntraStaffBinding(
        event.data.entraTenantId,
        event.data.entraObjectId
      );

      records.set(event.staffId, {
        staffId: event.staffId,
        displayName,
        roleLabel: normalizeText(event.data.roleLabel) || null,
        status: event.data.status ?? "active",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        lastEventId: event.eventId,
        entraTenantId: entraBinding?.entraTenantId ?? null,
        entraObjectId: entraBinding?.entraObjectId ?? null
      });

      continue;
    }

    const existing = records.get(event.staffId);

    if (!existing) {
      continue;
    }

    if (event.type === "staff.updated") {
      const entraBinding = normalizeEntraStaffBinding(
        event.data.entraTenantId,
        event.data.entraObjectId
      );

      records.set(event.staffId, {
        ...existing,
        displayName:
          event.data.displayName === undefined
            ? existing.displayName
            : normalizeText(event.data.displayName) || existing.displayName,
        roleLabel:
          event.data.roleLabel === undefined
            ? existing.roleLabel
            : normalizeText(event.data.roleLabel) || null,
        status:
          event.data.status === undefined
            ? existing.status
            : event.data.status,
        updatedAt: event.occurredAt,
        lastEventId: event.eventId,
        entraTenantId:
          event.data.entraTenantId === undefined &&
          event.data.entraObjectId === undefined
            ? existing.entraTenantId
            : entraBinding?.entraTenantId ?? null,
        entraObjectId:
          event.data.entraTenantId === undefined &&
          event.data.entraObjectId === undefined
            ? existing.entraObjectId
            : entraBinding?.entraObjectId ?? null
      });

      continue;
    }

    records.set(event.staffId, {
      ...existing,
      status: "inactive",
      updatedAt: event.occurredAt,
      lastEventId: event.eventId
    });
  }

  return [...records.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName) ||
    a.staffId.localeCompare(b.staffId)
  );
}
