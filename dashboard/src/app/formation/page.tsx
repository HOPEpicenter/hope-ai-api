"use client";

import { useState } from "react";
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
  error?: string;
};

export default function FormationPage() {
  const [visitorId, setVisitorId] = useState("");
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    if (!visitorId.trim()) {
      return;
    }

    setLoading(true);
    setError("");
    setProfile(null);
    setEvents([]);

    try {
      const profileRes = await fetch(
        `/api/dashboard/formation/profile?visitorId=${encodeURIComponent(visitorId)}`
      );

      const eventsRes = await fetch(
        `/api/dashboard/formation/recent-events?visitorId=${encodeURIComponent(visitorId)}&limit=20`
      );

      const profileText = await profileRes.text();
      const eventsText = await eventsRes.text();

      const profileJson: ProfileResponse = profileText ? JSON.parse(profileText) : {};
      const eventsJson: EventsResponse = eventsText ? JSON.parse(eventsText) : {};

      if (!profileRes.ok) {
        throw new Error(profileJson.error || `Profile request failed with status ${profileRes.status}`);
      }

      if (!eventsRes.ok) {
        throw new Error(eventsJson.error || `Recent events request failed with status ${eventsRes.status}`);
      }

      setProfile(profileJson);
      setEvents(eventsJson.items ?? []);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected formation load error.";
      console.error(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleString();
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-xl font-semibold">Formation Inspector</h1>

      <div className="flex gap-2">
        <input
          value={visitorId}
          onChange={(e) => setVisitorId(e.target.value)}
          placeholder="visitorId"
          className="w-full rounded border px-3 py-2"
        />
        <button
          onClick={load}
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
          <div className="rounded border p-4 relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gray-200">
            <div className="text-xs text-gray-500">Visitor</div>
            <div className="break-all font-medium">{profile.visitorId ?? "—"}</div>
          </div>

          <div className="rounded border p-4 relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gray-200">
            <div className="text-xs text-gray-500">Stage</div>
            <div className="font-medium">{profile.profile?.stage ?? "—"}</div>
          </div>

          <div className="rounded border p-4 relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gray-200">
            <div className="text-xs text-gray-500">Last Event</div>
            <div className="font-medium">{profile.profile?.lastEventType ?? "—"}</div>
          </div>

          <div className="rounded border p-4 relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gray-200">
            <div className="text-xs text-gray-500">Updated</div>
            <div className="font-medium">{formatDate(profile.profile?.updatedAt)}</div>
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-lg font-medium">Recent Events</h2>

        {!loading && !events.length ? (
          <div className="text-sm text-gray-500">No events found.</div>
        ) : null}

        <div className="space-y-3">
          {events.map((e) => (
            <div key={e.rowKey ?? e.id ?? `${e.type}-${e.occurredAt}`} className="rounded border p-4 relative pl-6 before:absolute before:left-2 before:top-0 before:h-full before:w-px before:bg-gray-200">
              <div className="flex justify-between gap-4 relative"><span className="absolute -left-4 top-1.5 h-2.5 w-2.5 rounded-full bg-black"></span>
                <div>
                  <div className="font-medium">{e.type ?? "Unknown event"}</div>
                  <div className="text-sm text-gray-600">{formatFormationEventSummary(e.type, e.metadata)}</div>
                </div>

                <div className="text-right text-xs text-gray-500">
                  {formatDate(e.occurredAt)}
                </div>
              </div>

              <details className="mt-3">
                <summary className="cursor-pointer text-xs">metadata</summary>
                <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-2 text-xs">
{JSON.stringify(e.metadata ?? {}, null, 2)}
                </pre>
              </details>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}


