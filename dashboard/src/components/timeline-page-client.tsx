"use client";

import { useState } from "react";
import { TimelineList } from "@/components/timeline-list";
import type { TimelineItem, TimelineResponse } from "@/lib/contracts/timeline";

type Props = {
  initialItems: TimelineItem[];
  initialNextCursor: string | null;
};

export function TimelinePageClient({ initialItems, initialNextCursor }: Props) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formationCount = items.filter((x) => x.stream === "formation").length;
  const engagementCount = items.filter((x) => x.stream === "engagement").length;

  async function loadMore() {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      params.set("before", nextCursor);

      const response = await fetch(`/api/dashboard/timeline/unified?${params.toString()}`, {
        method: "GET",
        cache: "no-store"
      });

      const text = await response.text();
      const json = text ? JSON.parse(text) : {};

      if (!response.ok) {
        throw new Error(json?.error || `Timeline request failed with status ${response.status}`);
      }

      const data = json as TimelineResponse;

      setItems((current) => [...current, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more timeline items.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Timeline</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Unified pastoral activity stream across formation and engagement.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{items.length}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Formation Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formationCount}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Engagement Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{engagementCount}</div>
        </div>
      </div>

      <TimelineList items={items} />

      {error ? (
        <div style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div>
      ) : null}

      {nextCursor ? (
        <div>
          <button
            type="button"
            onClick={loadMore}
            disabled={isLoading}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: isLoading ? "not-allowed" : "pointer"
            }}
          >
            {isLoading ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
