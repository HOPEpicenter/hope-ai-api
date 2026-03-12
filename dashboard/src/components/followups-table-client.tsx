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

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

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

function matchesAssigneeFilter(item: FollowupItem, filter: string) {
  if (filter === "all") return true;
  return (item.assignedTo?.ownerId ?? "") === filter;
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

function countAgedItems(items: FollowupItem[], minimumHours: number) {
  return items.filter((item) => {
    if (!item.needsFollowup) return false;
    const hours = getFollowupAgeHours(item.lastFollowupAssignedAt);
    return hours !== null && hours >= minimumHours;
  }).length;
}

function PresetButton({
  active,
  disabled,
  label,
  onClick
}: {
  active: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: active ? "1px solid #111827" : "1px solid #d1d5db",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1
      }}
    >
      {label}
    </button>
  );
}

export function FollowupsTableClient({ items }: Props) {
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [ageFilter, setAgeFilter] = useState<AgeFilter>("all");
  const [sort, setSort] = useState<SortOption>("oldest-assigned");
  const [assigneeFilter, setAssigneeFilter] = useState<string>("all");

  const normalizedSearch = search.trim().toLowerCase();

  const assigneeOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.assignedTo?.ownerId).filter(Boolean))).sort();
  }, [items]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      return (
        matchesSearch(item, normalizedSearch) &&
        matchesQueueFilter(item, queueFilter) &&
        matchesAgeFilter(item, ageFilter) &&
        matchesAssigneeFilter(item, assigneeFilter)
      );
    });

    return sortItems(filtered, sort);
  }, [items, normalizedSearch, queueFilter, ageFilter, assigneeFilter, sort]);

  const aged24Count = useMemo(() => countAgedItems(items, 24), [items]);
  const aged48Count = useMemo(() => countAgedItems(items, 48), [items]);
  const aged72Count = useMemo(() => countAgedItems(items, 72), [items]);

  const mineActive = assigneeFilter !== "all" && assigneeFilter === MY_ASSIGNEE;

  function applyAllPreset() {
    setQueueFilter("all");
    setAgeFilter("all");
    setSort("oldest-assigned");
    setAssigneeFilter("all");
  }

  function applyMinePreset() {
    if (!MY_ASSIGNEE) return;
    setQueueFilter("action-needed");
    setAgeFilter("all");
    setSort("oldest-assigned");
    setAssigneeFilter(MY_ASSIGNEE);
  }

  function applyStale48Preset() {
    setQueueFilter("action-needed");
    setAgeFilter("48h+");
    setSort("oldest-assigned");
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>24h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged24Count}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>48h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged48Count}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>72h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged72Count}</div>
        </div>
      </div>

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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <PresetButton active={!mineActive && queueFilter === "all" && ageFilter === "all" && assigneeFilter === "all"} label="All" onClick={applyAllPreset} />
          <PresetButton active={mineActive && queueFilter === "action-needed"} label="My Followups" onClick={applyMinePreset} disabled={!MY_ASSIGNEE} />
          <PresetButton active={queueFilter === "action-needed" && ageFilter === "48h+"} label="Stale 48h+" onClick={applyStale48Preset} />
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) repeat(4, minmax(0, 1fr))",
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
            <label htmlFor="followups-assignee" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Assignee
            </label>
            <select
              id="followups-assignee"
              value={assigneeFilter}
              onChange={(event) => setAssigneeFilter(event.target.value)}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              <option value="all">All</option>
              {assigneeOptions.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
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
