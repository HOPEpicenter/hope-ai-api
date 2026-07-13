import {
  STAFF_IDENTITY_REGISTRY,
  type StaffStatus
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
};

function normalizeText(value: unknown): string {
  return String(value ?? "").trim();
}

export function projectStaffDirectory(
  events: StaffEvent[]
): CanonicalStaffIdentity[] {
  const records = new Map<string, CanonicalStaffIdentity>();

  for (const seed of STAFF_IDENTITY_REGISTRY) {
    records.set(seed.staffId, {
      staffId: seed.staffId,
      displayName: seed.displayName,
      roleLabel: seed.roleLabel,
      status: "active",
      createdAt: null,
      updatedAt: null,
      lastEventId: null
    });
  }

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

      records.set(event.staffId, {
        staffId: event.staffId,
        displayName,
        roleLabel: normalizeText(event.data.roleLabel) || null,
        status: event.data.status ?? "active",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        lastEventId: event.eventId
      });

      continue;
    }

    const existing = records.get(event.staffId);

    if (!existing) {
      continue;
    }

    if (event.type === "staff.updated") {
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
        lastEventId: event.eventId
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
