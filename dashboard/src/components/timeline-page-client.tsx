"use client";

import { useState } from "react";
import { TimelineList } from "@/components/timeline-list";
import type { TimelineItem, TimelineResponse } from "@/lib/contracts/timeline";

type Props = {
  initialItems: TimelineItem[];
  initialNextCursor: string | null;
};

async function fetchTimelinePage(limit: number, cursor?: string): Promise<TimelineResponse> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));

  if (cursor) {
    params.set("cursor", cursor);
  }

  const response = await fetch(`/api/dashboard/timeline/unified?${params.toString()}`, {
    method: "GET",
    cache: "no-store"
  });

  const text = await response.text();
  const json = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(json?.error || `Timeline request failed with status ${response.status}`);
  }

  return json as TimelineResponse;
}

export function TimelinePageClient({ initialItems, initialNextCursor }: Props) {
  const [items, setItems] = useState<TimelineItem[]>(initialItems);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [pageSize, setPageSize] = useState<number>(50);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formationCount = items.filter((x) => x.stream === "formation").length;
  const engagementCount = items.filter((x) => x.stream === "engagement").length;

  async function loadMore() {
    if (!nextCursor || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTimelinePage(pageSize, nextCursor);
      setItems((current) => [...current, ...(data.items ?? [])]);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more timeline items.");
    } finally {
      setIsLoading(false);
    }
  }

  async function resetToPageSize(nextPageSize?: number) {
    if (isLoading) return;

    const limit = nextPageSize ?? pageSize;

    setIsLoading(true);
    setError(null);

    try {
      const data = await fetchTimelinePage(limit);
      setItems(data.items ?? []);
      setNextCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reload timeline items.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handlePageSizeChange(value: string) {
    const nextPageSize = Number(value);
    setPageSize(nextPageSize);
    await resetToPageSize(nextPageSize);
  }

  const canShowFewer = items.length > pageSize;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Timeline</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Unified pastoral activity stream across formation and engagement.
        </p>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 12
        }}
      >
        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 14,
            color: "#374151",
            fontWeight: 500
          }}
        >
          Per page
          <select
            value={String(pageSize)}
            onChange={(e) => void handlePageSizeChange(e.target.value)}
            disabled={isLoading}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              borderRadius: 10,
              padding: "8px 10px"
            }}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>

        {canShowFewer ? (
          <button
            type="button"
            onClick={() => void resetToPageSize()}
            disabled={isLoading}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              borderRadius: 10,
              padding: "8px 12px",
              cursor: isLoading ? "not-allowed" : "pointer"
            }}
          >
            {isLoading ? "Updating..." : `Show fewer (${pageSize})`}
          </button>
        ) : null}
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
            onClick={() => void loadMore()}
            disabled={isLoading}
            style={{
              border: "1px solid #d1d5db",
              background: "#fff",
              borderRadius: 10,
              padding: "10px 14px",
              cursor: isLoading ? "not-allowed" : "pointer"
            }}
          >
            {isLoading ? "Loading..." : `Load more (${pageSize})`}
          </button>
        </div>
      ) : null}
    </section>
  );
}
