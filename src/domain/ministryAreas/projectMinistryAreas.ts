export type MinistryAreaStatus = "active" | "inactive";

export type MinistryAreaEvent = {
  eventId: string;
  ministryAreaId: string;
  type: "ministryArea.created" | "ministryArea.updated";
  occurredAt: string;
  actorId: string;
  sequence?: number;
  data: {
    displayName?: string;
    status?: MinistryAreaStatus;
    reason?: string | null;
  };
};

export type CanonicalMinistryArea = {
  ministryAreaId: string;
  displayName: string;
  status: MinistryAreaStatus;
  createdAt: string;
  updatedAt: string;
  lastEventId: string;
};

export function normalizeMinistryAreaName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function ministryAreaNameKey(value: string): string {
  return normalizeMinistryAreaName(value).toLowerCase();
}

export function projectMinistryAreas(events: MinistryAreaEvent[]): CanonicalMinistryArea[] {
  const records = new Map<string, CanonicalMinistryArea>();
  const seen = new Set<string>();
  const ordered = [...events].sort((a, b) =>
    (a.sequence ?? 0) - (b.sequence ?? 0) ||
    a.occurredAt.localeCompare(b.occurredAt) || a.eventId.localeCompare(b.eventId)
  );

  for (const event of ordered) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);

    if (event.type === "ministryArea.created") {
      const displayName = normalizeMinistryAreaName(event.data.displayName ?? "");
      if (!displayName || records.has(event.ministryAreaId)) continue;
      records.set(event.ministryAreaId, {
        ministryAreaId: event.ministryAreaId,
        displayName,
        status: "active",
        createdAt: event.occurredAt,
        updatedAt: event.occurredAt,
        lastEventId: event.eventId
      });
      continue;
    }

    const existing = records.get(event.ministryAreaId);
    if (!existing) continue;
    records.set(event.ministryAreaId, {
      ...existing,
      displayName: event.data.displayName === undefined
        ? existing.displayName
        : normalizeMinistryAreaName(event.data.displayName) || existing.displayName,
      status: event.data.status ?? existing.status,
      updatedAt: event.occurredAt,
      lastEventId: event.eventId
    });
  }

  return [...records.values()].sort((a, b) =>
    a.displayName.localeCompare(b.displayName) ||
    a.ministryAreaId.localeCompare(b.ministryAreaId)
  );
}
