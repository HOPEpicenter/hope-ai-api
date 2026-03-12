"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FollowupsTable } from "@/components/followups-table";
import type { FollowupItem } from "@/lib/contracts/followups";

type Props = {
  items: FollowupItem[];
};

type QueueFilter = "all" | "action-needed" | "contact-made";
type AgeFilter = "all" | "24h+" | "48h+" | "72h+";
type StageFilter = "all" | "guest" | "connected" | "member" | "unknown";
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

function matchesStageFilter(item: FollowupItem, filter: StageFilter) {
  if (filter === "all") return true;

  const stage = (item.stage ?? "").trim().toLowerCase();
  if (!stage) return filter === "unknown";

  return stage === filter;
}

function matchesOutcomeFilter(item: FollowupItem, filter: string) {
  if (filter === "all") return true;
  return (item.lastFollowupOutcome ?? "").trim().toLowerCase() === filter;
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
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialSearch = searchParams.get("q") ?? "";
  const initialQueueFilter = (searchParams.get("queue") as QueueFilter | null) ?? "all";
  const initialAgeFilter = (searchParams.get("age") as AgeFilter | null) ?? "all";
  const initialStageFilter = (searchParams.get("stage") as StageFilter | null) ?? "all";
  const initialSort = (searchParams.get("sort") as SortOption | null) ?? "oldest-assigned";
  const initialAssigneeFilter = searchParams.get("assignee") ?? "all";

  const [search, setSearch] = useState(initialSearch);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>(initialQueueFilter);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>(initialAgeFilter);
  const [stageFilter, setStageFilter] = useState<StageFilter>(initialStageFilter);
  const [outcomeFilter, setOutcomeFilter] = useState<string>(searchParams.get("outcome") ?? "all");
  const [sort, setSort] = useState<SortOption>(initialSort);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(initialAssigneeFilter);

  const normalizedSearch = search.trim().toLowerCase();

  const assigneeOptions = useMemo(() => {
    return Array.from(new Set(items.map((item) => item.assignedTo?.ownerId).filter(Boolean))).sort();
  }, [items]);

  function updateUrl(next: {
    q?: string;
    queue?: QueueFilter;
    age?: AgeFilter;
    stage?: StageFilter;
    outcome?: string;
    sort?: SortOption;
    assignee?: string;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    const q = next.q ?? search;
    const queue = next.queue ?? queueFilter;
    const age = next.age ?? ageFilter;
    const stage = next.stage ?? stageFilter;
    const outcome = next.outcome ?? outcomeFilter;
    const sortValue = next.sort ?? sort;
    const assignee = next.assignee ?? assigneeFilter;

    if (q && q.trim()) {
      params.set("q", q.trim());
    } else {
      params.delete("q");
    }

    if (queue !== "all") {
      params.set("queue", queue);
    } else {
      params.delete("queue");
    }

    if (age !== "all") {
      params.set("age", age);
    } else {
      params.delete("age");
    }

    if (stage !== "all") {
      params.set("stage", stage);
    } else {
      params.delete("stage");
    }

    if (outcome !== "all") {
      params.set("outcome", outcome);
    } else {
      params.delete("outcome");
    }


    if (sortValue !== "oldest-assigned") {
      params.set("sort", sortValue);
    } else {
      params.delete("sort");
    }

    if (assignee !== "all") {
      params.set("assignee", assignee);
    } else {
      params.delete("assignee");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      return (
        matchesSearch(item, normalizedSearch) &&
        matchesQueueFilter(item, queueFilter) &&
        matchesAgeFilter(item, ageFilter) &&
        matchesStageFilter(item, stageFilter) &&
        matchesOutcomeFilter(item, outcomeFilter) &&
        matchesAssigneeFilter(item, assigneeFilter)
      );
    });

    return sortItems(filtered, sort);
  }, [items, normalizedSearch, queueFilter, ageFilter, stageFilter, outcomeFilter, assigneeFilter, sort]);

  const aged24Count = useMemo(() => countAgedItems(items, 24), [items]);
  const aged48Count = useMemo(() => countAgedItems(items, 48), [items]);
  const aged72Count = useMemo(() => countAgedItems(items, 72), [items]);

  const mineActive = assigneeFilter !== "all" && assigneeFilter === MY_ASSIGNEE;
  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    queueFilter !== "all" ||
    ageFilter !== "all" ||
    stageFilter !== "all" ||
    outcomeFilter !== "all" ||
    assigneeFilter !== "all" ||
    sort !== "oldest-assigned";

  function applyAllPreset() {
    setQueueFilter("all");
    setAgeFilter("all");
    setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter("all");
    updateUrl({
      queue: "all",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: "all"
    });
  }

  function applyMinePreset() {
    if (!MY_ASSIGNEE) return;
    setQueueFilter("action-needed");
    setAgeFilter("all");
    setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter(MY_ASSIGNEE);
    updateUrl({
      queue: "action-needed",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: MY_ASSIGNEE
    });
  }

  function applyStale48Preset() {
    setQueueFilter("action-needed");
    setAgeFilter("48h+");
    setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
    updateUrl({
      queue: "action-needed",
      age: "48h+",
      sort: "oldest-assigned"
    });
  }

  function clearAllFilters() {
    setSearch("");
    setQueueFilter("all");
    setAgeFilter("all");
    setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter("all");
    updateUrl({
      q: "",
      queue: "all",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: "all"
    });
  }

  function applyAgeSummaryPreset(nextAge: AgeFilter) {
    setQueueFilter("action-needed");
    setAgeFilter(nextAge);
    setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
    updateUrl({
      queue: "action-needed",
      age: nextAge,
      sort: "oldest-assigned"
    });
  }

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <button
          type="button"
          onClick={() => applyAgeSummaryPreset("24h+")}
          style={{
            background: "#fff",
            border: queueFilter === "action-needed" && ageFilter === "24h+" ? "2px solid #2563eb" : "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            textAlign: "left",
            cursor: "pointer"
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>24h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged24Count}</div>
        </button>
        <button
          type="button"
          onClick={() => applyAgeSummaryPreset("48h+")}
          style={{
            background: "#fff",
            border: queueFilter === "action-needed" && ageFilter === "48h+" ? "2px solid #2563eb" : "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            textAlign: "left",
            cursor: "pointer"
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>48h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged48Count}</div>
        </button>
        <button
          type="button"
          onClick={() => applyAgeSummaryPreset("72h+")}
          style={{
            background: "#fff",
            border: queueFilter === "action-needed" && ageFilter === "72h+" ? "2px solid #2563eb" : "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            textAlign: "left",
            cursor: "pointer"
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280" }}>72h+ Action Needed</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{aged72Count}</div>
        </button>
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
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <PresetButton active={!mineActive && queueFilter === "all" && ageFilter === "all" && assigneeFilter === "all"} label="All" onClick={applyAllPreset} />
            <PresetButton active={mineActive && queueFilter === "action-needed"} label="My Followups" onClick={applyMinePreset} disabled={!MY_ASSIGNEE} />
            <PresetButton active={queueFilter === "action-needed" && ageFilter === "48h+"} label="Stale 48h+" onClick={applyStale48Preset} />
          </div>

          {hasActiveFilters ? (
            <button
              type="button"
              onClick={clearAllFilters}
              style={{
                border: "none",
                background: "transparent",
                color: "#1d4ed8",
                fontWeight: 600,
                cursor: "pointer",
                padding: 0
              }}
            >
              Clear all
            </button>
          ) : null}
        </div>

        {hasActiveFilters ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {normalizedSearch ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateUrl({ q: "" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Search: {search.trim()} ×
              </button>
            ) : null}

            {queueFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setQueueFilter("all");
                  updateUrl({ queue: "all" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Queue: {queueFilter === "action-needed" ? "Action needed" : "Contact made"} ×
              </button>
            ) : null}

            {ageFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setAgeFilter("all");
                  updateUrl({ age: "all" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Age: {ageFilter} ×
              </button>
            ) : null}

            {stageFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setStageFilter("all");
                  updateUrl({ stage: "all" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Stage: {stageFilter} ×
              </button>
            ) : null}

            {outcomeFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setOutcomeFilter("all");
                  updateUrl({ outcome: "all" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Outcome: {outcomeFilter} ×
              </button>
            ) : null}

            {assigneeFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setAssigneeFilter("all");
                  updateUrl({ assignee: "all" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Assignee: {assigneeFilter} ×
              </button>
            ) : null}

            {sort !== "oldest-assigned" ? (
              <button
                type="button"
                onClick={() => {
                  setStageFilter("all");
                  setSort("oldest-assigned");
    setOutcomeFilter("all");
                  updateUrl({ sort: "oldest-assigned" });
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  borderRadius: 999,
                  padding: "6px 10px",
                  fontSize: 12,
                  color: "#111827",
                  cursor: "pointer"
                }}
              >
                Sort: {sort === "newest-assigned" ? "Newest assigned" : "Last contact"} ×
              </button>
            ) : null}
          </div>
        ) : null}

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
              onChange={(event) => {
                const value = event.target.value;
                setSearch(value);
                updateUrl({ q: value });
              }}
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
              onChange={(event) => {
                const value = event.target.value as QueueFilter;
                setQueueFilter(value);
                updateUrl({ queue: value });
              }}
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
              onChange={(event) => {
                const value = event.target.value as AgeFilter;
                setAgeFilter(value);
                updateUrl({ age: value });
              }}
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
            <label htmlFor="followups-stage-filter" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Stage
            </label>
            <select
              id="followups-stage-filter"
              value={stageFilter}
              onChange={(event) => {
                const value = event.target.value as StageFilter;
                setStageFilter(value);
                updateUrl({ stage: value });
              }}
              style={{
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              <option value="all">All</option>
              <option value="guest">Guest</option>
              <option value="connected">Connected</option>
              <option value="member">Member</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label htmlFor="followups-assignee" style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>
              Assignee
            </label>
            <select
              id="followups-assignee"
              value={assigneeFilter}
              onChange={(event) => {
                const value = event.target.value;
                setAssigneeFilter(value);
                updateUrl({ assignee: value });
              }}
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
              onChange={(event) => {
                const value = event.target.value as SortOption;
                setSort(value);
                updateUrl({ sort: value });
              }}
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

      <FollowupsTable
        items={filteredItems}
        queueFilter={queueFilter}
        assigneeFilter={assigneeFilter}
        ageFilter={ageFilter}
        stageFilter={stageFilter}
        outcomeFilter={outcomeFilter}
        sort={sort}
        onQueueSelect={(value) => {
          setQueueFilter(value);
          updateUrl({ queue: value });
        }}
        onAssigneeSelect={(value) => {
          setAssigneeFilter(value);
          updateUrl({ assignee: value });
        }}
        onAgeSelect={(value) => {
          setQueueFilter("action-needed");
          setAgeFilter(value);
          setStageFilter("all");
          setSort("oldest-assigned");
          setOutcomeFilter("all");
          updateUrl({
            queue: "action-needed",
            age: value,
            stage: "all",
            outcome: "all",
            sort: "oldest-assigned"
          });
        }}
        onStageSelect={(value) => {
          setStageFilter(value);
          updateUrl({ stage: value });
        }}
        onOutcomeSelect={(value) => {
          setOutcomeFilter(value);
          updateUrl({ outcome: value });
        }}
        onSortSelect={(value) => {
          setSort(value);
          updateUrl({ sort: value });
        }}
      />
    </section>
  );
}

































