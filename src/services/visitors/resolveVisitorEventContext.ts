/**
 * Pure event resolution boundary.
 * The caller supplies backend-approved event records.
 * Public requests cannot create or redefine events.
 */
export type VisitorEvent = {
  id: string;
  date: string;
  name: string;
  active: boolean;
};

export type VisitorEventResolution =
  | { status: "resolved"; serviceId: string; name: string }
  | { status: "selection_required"; options: VisitorEvent[] }
  | { status: "invalid_event" };

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(value: string): boolean {
  if (!DATE.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00Z`);

  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value;
}

export function resolveVisitorEventContext(input: {
  date: string;
  selectedEventId?: string;
  approvedEvents: readonly VisitorEvent[];
}): VisitorEventResolution {
  const { date, selectedEventId, approvedEvents } = input;

  if (!validDate(date)) {
    return { status: "invalid_event" };
  }

  const available = approvedEvents.filter(event =>
    event.active &&
    event.date === date &&
    ID.test(event.id) &&
    event.name.trim().length > 0
  );

  if (new Set(available.map(event => event.id)).size !== available.length) {
    return { status: "invalid_event" };
  }

  if (selectedEventId !== undefined) {
    const selected = available.find(
      event => event.id === selectedEventId
    );

    if (!selected) {
      return { status: "invalid_event" };
    }

    return {
      status: "resolved",
      serviceId: selected.id,
      name: selected.name
    };
  }

  if (available.length > 1) {
    return {
      status: "selection_required",
      options: available
    };
  }

  if (available.length === 1) {
    return {
      status: "resolved",
      serviceId: available[0].id,
      name: available[0].name
    };
  }

  // General attendance remains available without a scheduled event.
  return {
    status: "resolved",
    serviceId: `visit-${date}`,
    name: "General Visit"
  };
}