import { FormationEvent, formatDateTime, getEventSummary } from "./formation-inspector-helpers";

type Props = {
  events: FormationEvent[];
};

export function FormationEventList({ events }: Props) {
  if (!events.length) {
    return (
      <div className="rounded-lg border p-4 text-sm text-gray-600">
        No formation events found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {events.map((event) => (
        <div key={event.rowKey ?? event.id ?? Math.random()} className="rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">{event.type ?? "Unknown event"}</div>
              <div className="text-sm text-gray-600">{getEventSummary(event)}</div>
            </div>
            <div className="text-xs text-gray-500 text-right">
              <div>Occurred</div>
              <div>{formatDateTime(event.occurredAt)}</div>
            </div>
          </div>

          <div className="mt-3 grid gap-2 text-xs text-gray-600 sm:grid-cols-3">
            <div>
              <div className="font-medium text-gray-800">Visitor</div>
              <div>{event.visitorId ?? "—"}</div>
            </div>
            <div>
              <div className="font-medium text-gray-800">Channel</div>
              <div>{event.channel ?? "—"}</div>
            </div>
            <div>
              <div className="font-medium text-gray-800">Recorded</div>
              <div>{formatDateTime(event.recordedAt)}</div>
            </div>
          </div>

          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-medium text-gray-700">
              View raw metadata
            </summary>
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs">
{JSON.stringify(event.metadata ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      ))}
    </div>
  );
}
