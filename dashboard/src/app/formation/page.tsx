"use client";

import { useMemo, useState } from "react";
import { formatFormationEventSummary } from "@/lib/format-formation-event-summary";

type EventItem = {
  id: string | null;
  rowKey: string | null;
  visitorId: string | null;
  type: string | null;
  occurredAt: string | null;
  recordedAt: string | null;
  channel: string | null;
  summary: string | null;
  metadata: any;
};

type ProfileResponse = {
  ok?: boolean;
  visitorId?: string;
  profile?: {
    stage?: string | null;
    lastEventType?: string | null;
    updatedAt?: string | null;
  };
  error?: string;
};

type EventsResponse = {
  ok?: boolean;
  items?: EventItem[];
  nextCursor?: string | null;
  error?: string;
};

export default function FormationPage() {
  const [visitorId, setVisitorId] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [typeFilter, setTypeFilter] = useState("ALL");

  async function readJson(response: Response) {
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  }

  async function loadInitial() {
    if (!visitorId.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setProfile(null);
    setEvents([]);
    setNextCursor(null);

    try {
      const profileRes = await fetch(
        `/api/dashboard/formation/profile?visitorId=${encodeURIComponent(visitorId)}`
      );

      const eventsRes = await fetch(
        `/api/dashboard/formation/recent-events?visitorId=${encodeURIComponent(visitorId)}&limit=10`
      );

      const profileJson: ProfileResponse = await readJson(profileRes);
      const eventsJson: EventsResponse = await readJson(eventsRes);

      if (!profileRes.ok) {
        throw new Error(profileJson.error || `Profile request failed with status ${profileRes.status}`);
      }

      if (!eventsRes.ok) {
        throw new Error(eventsJson.error || `Recent events request failed with status ${eventsRes.status}`);
      }

      setProfile(profileJson);
      setEvents(eventsJson.items ?? []);
      setNextCursor(eventsJson.nextCursor ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected formation load error.";
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!visitorId.trim() || !nextCursor) {
      return;
    }

    setLoadingMore(true);
    setError("");

    try {
      const response = await fetch(
        `/api/dashboard/formation/recent-events?visitorId=${encodeURIComponent(visitorId)}&limit=10&before=${encodeURIComponent(nextCursor)}`
      );

      const json: EventsResponse = await readJson(response);

      if (!response.ok) {
        throw new Error(json.error || `Recent events request failed with status ${response.status}`);
      }

      const incoming = json.items ?? [];
      setEvents((current) => {
        const seen = new Set(current.map((item) => item.rowKey ?? item.id));
        const deduped = incoming.filter((item) => !seen.has(item.rowKey ?? item.id));
        return [...current, ...deduped];
      });
      setNextCursor(json.nextCursor ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected formation pagination error.";
      console.error(err);
      setError(message);
    } finally {
      setLoadingMore(false);
    }
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return "—";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  const eventTypes = useMemo(() => {
    const types = events
      .map((event) => event.type?.trim())
      .filter((value): value is string => Boolean(value));

    return ["ALL", ...Array.from(new Set(types))];
  }, [events]);

  const filteredEvents = useMemo(() => {
    if (typeFilter === "ALL") {
      return events;
    }

    return events.filter((event) => event.type === typeFilter);
  }, [events, typeFilter]);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Formation Timeline</h1>
        <p className="text-sm text-gray-600">
          Inspect profile state and formation events for a single visitor.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          value={visitorId}
          onChange={(e) => setVisitorId(e.target.value)}
          placeholder="visitorId"
          className="w-full rounded border px-3 py-2"
        />

        <button
          onClick={loadInitial}
          disabled={loading}
          className="rounded bg-black px-4 py-2 text-white disabled:opacity-60"
        >
          {loading ? "Loading..." : "Load"}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {profile ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border p-4">
            <div className="text-xs text-gray-500">Visitor</div>
            <div className="break-all font-medium">{profile.visitorId ?? "—"}</div>
          </div>

          <div className="rounded border p-4">
            <div className="text-xs text-gray-500">Stage</div>
            <div className="font-medium">{profile.profile?.stage ?? "—"}</div>
          </div>

          <div className="rounded border p-4">
            <div className="text-xs text-gray-500">Last Event</div>
            <div className="font-medium">{profile.profile?.lastEventType ?? "—"}</div>
          </div>

          <div className="rounded border p-4">
            <div className="text-xs text-gray-500">Updated</div>
            <div className="font-medium">{formatDate(profile.profile?.updatedAt)}</div>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-medium">Timeline</h2>
          <p className="text-sm text-gray-600">
            Newest first. Load more to walk back through the formation history.
          </p>
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded border px-3 py-2 text-sm"
        >
          {eventTypes.map((eventType) => (
            <option key={eventType} value={eventType}>
              {eventType === "ALL" ? "All events" : eventType}
            </option>
          ))}
        </select>
      </div>

      {!loading && !filteredEvents.length ? (
        <div className="rounded border p-4 text-sm text-gray-500">
          No events found.
        </div>
      ) : null}

      <div className="space-y-0">
        {filteredEvents.map((event, index) => {
          const isLast = index === filteredEvents.length - 1;

          return (
            <div key={event.rowKey ?? event.id ?? `${event.type}-${event.occurredAt}`} className="relative pl-8">
              {!isLast ? (
                <div className="absolute left-3 top-6 h-full w-px bg-gray-200" />
              ) : null}

              <div className="absolute left-0 top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-white">
                <div className="h-2.5 w-2.5 rounded-full bg-black" />
              </div>

              <div className="mb-4 rounded border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-medium">{event.type ?? "Unknown event"}</div>
                    <div className="text-sm text-gray-600">
                      {formatFormationEventSummary(event.type, event.metadata)}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500 sm:text-right">
                    <div>Occurred</div>
                    <div>{formatDate(event.occurredAt)}</div>
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
                    <div>{formatDate(event.recordedAt)}</div>
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
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={loadMore}
          disabled={loadingMore || !nextCursor}
          className="rounded border px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loadingMore ? "Loading..." : nextCursor ? "Load more" : "No more events"}
        </button>

        <div className="text-xs text-gray-500">
          {events.length ? `${events.length} loaded` : "No events loaded"}
        </div>
      </div>
    </div>
  );
}
