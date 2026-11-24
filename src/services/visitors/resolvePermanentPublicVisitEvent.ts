/**
 * Permanent public visitor event resolution.
 *
 * Available on every day of the week when the deployment
 * is enabled. No registered device, owner activation,
 * activation identity or manual event-opening action.
 *
 * The caller supplies a trusted backend event snapshot
 * and server time. Browser values are never authority.
 */

export type PermanentPublicVisitEvent = Readonly<{
  id: string;
  date: string;
  name: string;
  active: boolean;
}>;

export type PermanentPublicVisitContext = Readonly<{
  enabled?: boolean;
  nowMs: number;
  approvedEvents: readonly PermanentPublicVisitEvent[];
  selectedEventId?: unknown;
}>;

type EventChoice = Readonly<{
  serviceId: string;
  name: string;
}>;

export type PermanentPublicVisitResult =
  | Readonly<{
      status: "ready";
      kind: "scheduled" | "general";
      date: string;
      serviceId: string;
      name: string;
    }>
  | Readonly<{
      status: "selection_required";
      date: string;
      events: readonly EventChoice[];
    }>
  | Readonly<{
      status:
        | "disabled"
        | "unavailable"
        | "invalid_selection";
    }>;

const easternDateFormatter = new Intl.DateTimeFormat(
  "en-US",
  {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }
);

function easternDate(nowMs: number): string | null {
  if (!Number.isSafeInteger(nowMs)) {
    return null;
  }

  try {
    const parts = easternDateFormatter.formatToParts(
      new Date(nowMs)
    );

    const year = parts.find(
      part => part.type === "year"
    )?.value;

    const month = parts.find(
      part => part.type === "month"
    )?.value;

    const day = parts.find(
      part => part.type === "day"
    )?.value;

    const date = `${year}-${month}-${day}`;

    return validDate(date) ? date : null;
  } catch {
    return null;
  }
}

function validDate(value: unknown): value is string {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const timestamp = Date.parse(
    `${value}T00:00:00Z`
  );

  return Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString()
      .slice(0, 10) === value;
}

function validText(
  value: unknown,
  maxLength: number
): value is string {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxLength &&
    value.trim() === value &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function validEvent(
  value: unknown
): value is PermanentPublicVisitEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const event = value as Record<string, unknown>;

  return validText(event.id, 160) &&
    validDate(event.date) &&
    validText(event.name, 240) &&
    typeof event.active === "boolean";
}

function generalVisitId(date: string): string {
  const weekday = new Date(
    `${date}T00:00:00Z`
  ).getUTCDay();

  // Preserve the existing canonical date-based
  // Sunday and weekday fallback naming convention.
  return weekday === 0
    ? `sunday-${date}`
    : `visit-${date}`;
}

export function resolvePermanentPublicVisitEvent(
  context: PermanentPublicVisitContext
): PermanentPublicVisitResult {
  // Deployment safety switch only.
  // Not a per-event activation requirement.
  if (context.enabled !== true) {
    return { status: "disabled" };
  }

  const date = easternDate(context.nowMs);

  if (!date ||
      !Array.isArray(context.approvedEvents) ||
      !context.approvedEvents.every(validEvent)) {
    return { status: "unavailable" };
  }

  const selected = context.selectedEventId;

  if (selected !== undefined &&
      !validText(selected, 160)) {
    return { status: "invalid_selection" };
  }

  const today = context.approvedEvents.filter(
    event => event.date === date
  );

  // Ambiguous backend event identities fail closed.
  const identities = new Set(
    today.map(event => event.id)
  );

  if (identities.size !== today.length) {
    return { status: "unavailable" };
  }

  const active = today.filter(
    event => event.active === true
  );

  // A successfully loaded empty schedule is valid.
  // A failed or malformed schedule is not.
  if (active.length === 0) {
    const serviceId = generalVisitId(date);

    if (selected !== undefined &&
        selected !== serviceId) {
      return { status: "invalid_selection" };
    }

    return {
      status: "ready",
      kind: "general",
      date,
      serviceId,
      name: "General Visit"
    };
  }

  if (selected !== undefined) {
    const match = active.find(
      event => event.id === selected
    );

    if (!match) {
      return { status: "invalid_selection" };
    }

    return {
      status: "ready",
      kind: "scheduled",
      date,
      serviceId: match.id,
      name: match.name
    };
  }

  if (active.length === 1) {
    return {
      status: "ready",
      kind: "scheduled",
      date,
      serviceId: active[0].id,
      name: active[0].name
    };
  }

  return {
    status: "selection_required",
    date,
    events: active.map(event => ({
      serviceId: event.id,
      name: event.name
    }))
  };
}
