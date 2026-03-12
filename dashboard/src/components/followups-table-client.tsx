"use client";

import { useMemo, useState } from "react";
import { FollowupsTable } from "@/components/followups-table";
import type { FollowupItem } from "@/lib/contracts/followups";

type Props = {
  items: FollowupItem[];
};

type QueueFilter = "all" | "action-needed" | "contact-made";
type AgeFilter = "all" | "24h+" | "48h+" | "72h+";
type SortOption = "oldest-assigned" | "newest-assigned" | "last-contact";

function toTimestamp(value: string | null | undefined, fallback: number) {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : time;
}

function getFollowupAgeHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const assignedMs = new Date(value).getTime();
  if (Number.isNaN(assignedMs)) return null;

  const diffMs = Date.now() - assignedMs;
  if (diffMs < 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60));
}

function matchesSearch(item: FollowupItem, query: string) {
  if (!query) return true;

  const haystack = [
    item.visitorId,
    item.assignedTo?.ownerId ?? "",
    item.stage ?? "",
    item.lastFollowupOutcome ?? ""
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function matchesQueueFilter(item: FollowupItem, filter: QueueFilter) {
  if (filter === "all") return true;
  if (filter === "action-needed") return item.needsFollowup;
  return !item.needsFollowup;
}

function matchesAgeFilter(item: FollowupItem, filter: AgeFilter) {
  if (filter === "all") return true;

  const hours = getFollowupAgeHours(item.lastFollowupAssignedAt);
  if (hours === null) return false;

  if (filter === "72h+") return hours >= 72;
  if (filter === "48h+") return hours >= 48;
  if (filter === "24h+") return hours >= 24;
  return true;
}

function sortItems(items: FollowupItem[], sort: SortOption) {
  const sorted = [...items];

  sorted.sort((a, b) => {
    if (a.needsFollowup !== b.needsFollowup) {
      return a.needsFollowup ? -1 : 1;
    }

    if (sort === "oldest-assigned") {
      const diff =
        toTimestamp(a.lastFollowupAssignedAt, Number.MAX_SAFE_INTEGER) -
        toTimestamp(b.lastFollowupAssignedAt, Number.MAX_SAFE_INTEGER);
      if (diff !== 0) return diff;
    }

    if (sort === "newest-assigned") {
      const diff =
        toTimestamp(b.lastFollowupAssignedAt, Number.MIN_SAFE_INTEGER) -
        toTimestamp(a.lastFollowupAssignedAt, Number.MIN_SAFE_INTEGER);
      if (diff !== 0) return diff;
    }

    if (sort === "last-contact") {
      const diff =
        toTimestamp(b.lastFollowupContactedAt, Number.MIN_SAFE_INTEGER) -
        toTimestamp(a.lastFollowupContactedAt, Number.MIN_SAFE_INTEGER);
      if (diff !== 0) return diff;
    }

    return a.visitorId.localeCompare(b.visitorId);
  });

  return sorted;
}

export function FollowupsTableClient({ items }: Props) {
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [sort, setSort] = useState<SortOption>("oldest-assigned");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      return (
        matchesSearch(item, normalizedSearch) &&
        matchesQueueFilter(item, queueFilter) &&
        matchesAgeFilter(item, ageFilter)
      );
    });

    return sortItems(filtered, sort);
  }, [items, normalizedSearch, queueFilter, ageFilter, sort]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 12
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) repeat(3, minmax(0, 1fr))",
            gap: 12
          }}
        >
          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="followups-search" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Search
            </label>
            <input
              id="followups-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search visitor ID, assignee, stage, outcome"
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            />
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="followups-queue-filter" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Queue State
            </label>
            <select
              id="followups-queue-filter"
              value={queueFilter}
              onChange={(event) => setQueueFilter(event.target.value as QueueFilter)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              <option value="all">All</option>
              <option value="action-needed">Action needed</option>
              <option value="contact-made">Contact made</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="followups-age-filter" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Age
            </label>
            <select
              id="followups-age-filter"
              value={ageFilter}
              onChange={(event) => setAgeFilter(event.target.value as AgeFilter)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              <option value="all">All</option>
              <option value="24h+">24h+</option>
              <option value="48h+">48h+</option>
              <option value="72h+">72h+</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="followups-sort" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Sort
            </label>
            <select
              id="followups-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              <option value="oldest-assigned">Oldest assigned</option>
              <option value="newest-assigned">Newest assigned</option>
              <option value="last-contact">Last contact</option>
            </select>
          </div>
        </div>

        <div style={{ fontSize: 13, color: "#6b7280" }}>
          Showing {filteredItems.length} of {items.length} followups.
        </div>
      </div>

      <FollowupsTable items={filteredItems} />
    </section>
  );
}

