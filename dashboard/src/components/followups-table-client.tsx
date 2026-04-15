"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
type AttentionFilter = "all" | "needs-attention";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

function getQueueContextHint(assigneeFilter: string) {
  if (assigneeFilter === "me" || (MY_ASSIGNEE && assigneeFilter === MY_ASSIGNEE)) {
    return {
      title: "Showing my queue",
      message: "This view is focused on followups currently assigned to you."
    };
  }

  if (assigneeFilter === "all") {
    return {
      title: "Showing all open followups",
      message: "This view includes all currently open assigned followups."
    };
  }

  return {
    title: "Showing filtered queue",
    message: "This view is narrowed to a specific assignee or filter combination."
  };
}

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

  const q = query.trim().toLowerCase();

  const fields = [
    item.visitorId,
    item.assignedTo?.ownerId,
    item.stage,
    item.lastFollowupOutcome
  ];

  return fields
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(q));
}

function matchesQueueFilter(item: FollowupItem, filter: QueueFilter) {
  if (filter === "all") return true;
  return item.followupState === filter;
}

function matchesAttentionFilter(item: FollowupItem, filter: AttentionFilter) {
  if (filter === "all") return true;
  return item.needsFollowup;
}

function getAgeBucket(hours: number | null): "24h+" | "48h+" | "72h+" | "fresh" {
  if (hours === null) return "fresh";
  if (hours >= 72) return "72h+";
  if (hours >= 48) return "48h+";
  if (hours >= 24) return "24h+";
  return "fresh";
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
    const statePriority = {
      "action-needed": 0,
      "contact-made": 1,
      "done": 2,
      "unassigned": 3
    } as const;

    const urgencyPriority = {
      OVERDUE: 0,
      AT_RISK: 1,
      WATCH: 2,
      ON_TRACK: 3
    } as const;

    if (statePriority[a.followupState] !== statePriority[b.followupState]) {
      return statePriority[a.followupState] - statePriority[b.followupState];
    }

    if (urgencyPriority[a.urgency] !== urgencyPriority[b.urgency]) {
      return urgencyPriority[a.urgency] - urgencyPriority[b.urgency];
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

function countAgedItems(items: FollowupItem[], bucket: "24h+" | "48h+" | "72h+") {
  return items.filter((item) => {
    if (!item.needsFollowup) return false;
    const hours = getFollowupAgeHours(item.lastFollowupAssignedAt);
    return getAgeBucket(hours) === bucket;
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

function getScrollPosition(): number {
  if (typeof window === "undefined") return 0;
  return window.scrollY || window.pageYOffset || 0;
}

export function FollowupsTableClient({ items }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const initialSearch = searchParams.get("q") ?? "";
  const initialQueueFilter = (searchParams.get("queue") as QueueFilter | null) ?? "action-needed";
  const initialAgeFilter = (searchParams.get("age") as AgeFilter | null) ?? "72h+";
  const initialStageFilter = (searchParams.get("stage") as StageFilter | null) ?? "all";
  const initialSort = (searchParams.get("sort") as SortOption | null) ?? "oldest-assigned";
  const initialAssigneeFilter = searchParams.get("assignee") ?? "all";
  const initialAttentionFilter = (searchParams.get("attention") as AttentionFilter | null) ?? "all";

  const [search, setSearch] = useState(initialSearch);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>(initialQueueFilter);
  const [ageFilter, setAgeFilter] = useState<AgeFilter>(initialAgeFilter);
  const [stageFilter, setStageFilter] = useState<StageFilter>(initialStageFilter);
  const [outcomeFilter, setOutcomeFilter] = useState<string>(searchParams.get("outcome") ?? "all");
  const [sort, setSort] = useState<SortOption>(initialSort);
  const [assigneeFilter, setAssigneeFilter] = useState<string>(initialAssigneeFilter);
  const [attentionFilter, setAttentionFilter] = useState<AttentionFilter>(initialAttentionFilter);
  const [editingVisitorId, setEditingVisitorId] = useState<string | null>(null);
  const [editingOutcome, setEditingOutcome] = useState<string>("CONNECTED");
  const [editingNote, setEditingNote] = useState<string>("");
  const [isSavingOutcome, setIsSavingOutcome] = useState(false);
  const [isOutcomeSuccess, setIsOutcomeSuccess] = useState(false);
  const [outcomeError, setOutcomeError] = useState<string | null>(null);

  const normalizedSearch = search.trim().toLowerCase();
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        target?.isContentEditable
      ) {
        return;
      }

      event.preventDefault();
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const scrollValue = params.get("returnScroll");

    if (!scrollValue) return;

    const scrollY = Number(scrollValue);
    if (!Number.isFinite(scrollY)) return;

    window.scrollTo({ top: scrollY, behavior: "auto" });

    params.delete("returnScroll");

    const newUrl =
      params.toString().length > 0
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

    window.history.replaceState(null, "", newUrl);
  }, []);
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const returnVisitorId = params.get("returnVisitorId");

    if (!returnVisitorId) return;

    const selector = `[data-visitor-id="${returnVisitorId}"]`;
    const el = document.querySelector(selector) as HTMLElement | null;
    if (!el) return;

    el.style.outline = "2px solid #22c55e";
    el.style.boxShadow = "0 0 0 4px rgba(34, 197, 94, 0.2)";
    el.style.transition = "all 0.6s ease";

    setTimeout(() => {
      el.style.outline = "";
      el.style.boxShadow = "";
    }, 1800);

    params.delete("returnVisitorId");

    const newUrl =
      params.toString().length > 0
        ? `${window.location.pathname}?${params.toString()}`
        : window.location.pathname;

    window.history.replaceState(null, "", newUrl);
  }, []);

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
    attention?: AttentionFilter;
  }) {
    const params = new URLSearchParams(searchParams.toString());

    const q = next.q ?? search;
    const queue = next.queue ?? queueFilter;
    const age = next.age ?? ageFilter;
    const stage = next.stage ?? stageFilter;
    const outcome = next.outcome ?? outcomeFilter;
    const sortValue = next.sort ?? sort;
    const assignee = next.assignee ?? assigneeFilter;
    const attention = next.attention ?? attentionFilter;

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

    if (attention !== "all") {
      params.set("attention", attention);
    } else {
      params.delete("attention");
    }

    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const queueContextHint = getQueueContextHint(assigneeFilter);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      return (
        matchesSearch(item, normalizedSearch) &&
        matchesQueueFilter(item, queueFilter) &&
        matchesAgeFilter(item, ageFilter) &&
        matchesStageFilter(item, stageFilter) &&
        matchesOutcomeFilter(item, outcomeFilter) &&
        matchesAssigneeFilter(item, assigneeFilter) &&
        matchesAttentionFilter(item, attentionFilter)
      );
    });

    return sortItems(filtered, sort);
  }, [items, normalizedSearch, queueFilter, ageFilter, stageFilter, outcomeFilter, assigneeFilter, attentionFilter, sort]);

  const aged24Count = useMemo(() => countAgedItems(items, "24h+"), [items]);
  const aged48Count = useMemo(() => countAgedItems(items, "48h+"), [items]);
  const aged72Count = useMemo(() => countAgedItems(items, "72h+"), [items]);

  const mineActive = assigneeFilter !== "all" && assigneeFilter === MY_ASSIGNEE;

  const activePresetLabel =
    normalizedSearch.length === 0 &&
    !mineActive &&
    queueFilter === "action-needed" &&
    ageFilter === "72h+" &&
    stageFilter === "all" &&
    outcomeFilter === "all" &&
    assigneeFilter === "all" &&
    attentionFilter === "all"
      ? "Overdue"
    : normalizedSearch.length === 0 &&
      !mineActive &&
      queueFilter === "all" &&
      ageFilter === "all" &&
      stageFilter === "all" &&
      outcomeFilter === "all" &&
      assigneeFilter === "all" &&
      attentionFilter === "all"
      ? "All"
      : normalizedSearch.length === 0 && mineActive && queueFilter === "action-needed"
        ? "My Followups"
        : normalizedSearch.length === 0 && queueFilter === "action-needed" && ageFilter === "48h+"
          ? "Stale 48h+"
          : normalizedSearch.length === 0 && attentionFilter === "needs-attention"
            ? "Action needed"
            : null;

  const hasActiveFilters =
    normalizedSearch.length > 0 ||
    queueFilter !== "all" ||
    ageFilter !== "all" ||
    stageFilter !== "all" ||
    outcomeFilter !== "all" ||
    assigneeFilter !== "all" ||
    attentionFilter !== "all" ||
    sort !== "oldest-assigned";

  const hasCustomFilters = hasActiveFilters && activePresetLabel === null;

  function applyAllPreset() {
    setSearch("");
    setQueueFilter("all");
    setAgeFilter("all");
    setStageFilter("all");
    setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter("all");
    setAttentionFilter("all");
    updateUrl({
      q: "",
      queue: "all",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: "all",
      attention: "all"
    });
  }

  function applyOverduePreset() {
  setSearch("");
  setQueueFilter("action-needed");
  setAgeFilter("72h+");
  setStageFilter("all");
  setOutcomeFilter("all");
  setAssigneeFilter("all");
  setAttentionFilter("all");
  setSort("oldest-assigned");

  updateUrl({
    q: "",
    queue: "action-needed",
    age: "72h+",
    stage: "all",
    outcome: "all",
    assignee: "all",
    attention: "all",
    sort: "oldest-assigned"
  });
}

function applyAtRiskPreset() {
  setSearch("");
  setQueueFilter("action-needed");
  setAgeFilter("48h+");
  setStageFilter("all");
  setOutcomeFilter("all");
  setAssigneeFilter("all");
  setAttentionFilter("all");
  setSort("oldest-assigned");

  updateUrl({
    q: "",
    queue: "action-needed",
    age: "48h+",
    stage: "all",
    outcome: "all",
    assignee: "all",
    attention: "all",
    sort: "oldest-assigned"
  });
}

function applyWatchPreset() {
  setSearch("");
  setQueueFilter("action-needed");
  setAgeFilter("24h+");
  setStageFilter("all");
  setOutcomeFilter("all");
  setAssigneeFilter("all");
  setAttentionFilter("all");
  setSort("oldest-assigned");

  updateUrl({
    q: "",
    queue: "action-needed",
    age: "24h+",
    stage: "all",
    outcome: "all",
    assignee: "all",
    attention: "all",
    sort: "oldest-assigned"
  });
}

function applyMyOverduePreset() {
  if (!MY_ASSIGNEE) return;

  setSearch("");
  setQueueFilter("action-needed");
  setAgeFilter("72h+");
  setStageFilter("all");
  setOutcomeFilter("all");
  setAssigneeFilter(MY_ASSIGNEE);
  setAttentionFilter("all");
  setSort("oldest-assigned");

  updateUrl({
    q: "",
    queue: "action-needed",
    age: "72h+",
    stage: "all",
    outcome: "all",
    assignee: MY_ASSIGNEE,
    attention: "all",
    sort: "oldest-assigned"
  });
}
function applyMinePreset() {
    if (!MY_ASSIGNEE) return;
    setSearch("");
    setQueueFilter("action-needed");
    setAgeFilter("all");
    setStageFilter("all");
    setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter(MY_ASSIGNEE);
    setAttentionFilter("all");
    updateUrl({
      q: "",
      queue: "action-needed",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: MY_ASSIGNEE,
      attention: "all"
    });
  }

  function applyStale48Preset() {
    setSearch("");
    setQueueFilter("action-needed");
    setAgeFilter("48h+");
    setStageFilter("all");
    setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAttentionFilter("all");
    updateUrl({
      q: "",
      queue: "action-needed",
      age: "48h+",
      sort: "oldest-assigned",
      attention: "all"
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
    setAttentionFilter("all");
    updateUrl({
      q: "",
      queue: "all",
      age: "all",
      stage: "all",
      sort: "oldest-assigned",
      outcome: "all",
      assignee: "all",
      attention: "all"
    });
  }

  function applyAgeSummaryPreset(nextAge: AgeFilter) {
    setSearch("");
    setQueueFilter("action-needed");
    setAgeFilter(nextAge);
    setStageFilter("all");
    setSort("oldest-assigned");
    setOutcomeFilter("all");
    setAssigneeFilter("all");
    setAttentionFilter("all");
    updateUrl({
      q: "",
      queue: "action-needed",
      age: nextAge,
      sort: "oldest-assigned",
      assignee: "all",
      attention: "all"
    });
  }

  function startOutcomeEdit(visitorId: string) {
    setEditingVisitorId(visitorId);
    setEditingOutcome("CONNECTED");
    setEditingNote("");
    setIsOutcomeSuccess(false);
    setOutcomeError(null);
  }

  function closeOutcomeEditor() {
    setEditingVisitorId(null);
    setEditingOutcome("CONNECTED");
    setEditingNote("");
    setOutcomeError(null);
  }

  function cancelOutcomeEdit() {
    closeOutcomeEditor();
    setIsOutcomeSuccess(false);
  }

  async function saveOutcome(visitorId: string, options?: { outcome?: string; note?: string }) {
    setIsSavingOutcome(true);
    setOutcomeError(null);

    try {
      const response = await fetch("/api/dashboard/followups/outcome", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          outcome: options?.outcome ?? editingOutcome,
          note: options?.note ?? editingNote
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/outcome failed with status ${response.status}`);
      }

      setIsOutcomeSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 650));
      closeOutcomeEditor();
      router.refresh();
    } catch (error) {
      setOutcomeError(error instanceof Error ? error.message : "Failed to record followup outcome.");
    } finally {
      setIsSavingOutcome(false);
    }
  }

  const currentFollowupsUrl = (() => {
    const params = new URLSearchParams();

    if (search.trim()) { params.set("q", search.trim()); }
    if (queueFilter !== "all") { params.set("queue", queueFilter); }
    if (ageFilter !== "all") { params.set("age", ageFilter); }
    if (stageFilter !== "all") { params.set("stage", stageFilter); }
    if (outcomeFilter !== "all") { params.set("outcome", outcomeFilter); }
    if (assigneeFilter !== "all") { params.set("assignee", assigneeFilter); }
    if (attentionFilter !== "all") { params.set("attention", attentionFilter); }
    if (sort !== "oldest-assigned") { params.set("sort", sort); }

    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();

  return (
    <section style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <button
          type="button"
          onClick={() => applyAgeSummaryPreset("24h+")}
          style={{
            background: "#fff",
            border: normalizedSearch.length === 0 && queueFilter === "action-needed" && ageFilter === "24h+" && stageFilter === "all" && outcomeFilter === "all" && assigneeFilter === "all" && attentionFilter === "all" && sort === "oldest-assigned" ? "2px solid #2563eb" : "1px solid #e5e7eb",
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
            border: normalizedSearch.length === 0 && queueFilter === "action-needed" && ageFilter === "48h+" && stageFilter === "all" && outcomeFilter === "all" && assigneeFilter === "all" && attentionFilter === "all" && sort === "oldest-assigned" ? "2px solid #2563eb" : "1px solid #e5e7eb",
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
            border: normalizedSearch.length === 0 && queueFilter === "action-needed" && ageFilter === "72h+" && stageFilter === "all" && outcomeFilter === "all" && assigneeFilter === "all" && attentionFilter === "all" && sort === "oldest-assigned" ? "2px solid #2563eb" : "1px solid #e5e7eb",
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
            <PresetButton active={normalizedSearch.length === 0 && !mineActive && queueFilter === "all" && ageFilter === "all" && stageFilter === "all" && outcomeFilter === "all" && assigneeFilter === "all" && attentionFilter === "all" && sort === "oldest-assigned"} label="All" onClick={applyAllPreset} />
            <PresetButton active={normalizedSearch.length === 0 && mineActive && queueFilter === "action-needed" && ageFilter === "all"} label="My Followups" onClick={applyMinePreset} disabled={!MY_ASSIGNEE} />
            <PresetButton active={queueFilter === "action-needed" && ageFilter === "72h+"} label="Overdue" onClick={applyOverduePreset} />
            <PresetButton active={queueFilter === "action-needed" && ageFilter === "48h+"} label="At Risk" onClick={applyAtRiskPreset} />
            <PresetButton active={queueFilter === "action-needed" && ageFilter === "24h+"} label="Watch" onClick={applyWatchPreset} />
            <PresetButton active={mineActive && queueFilter === "action-needed" && ageFilter === "72h+"} label="My Overdue" onClick={applyMyOverduePreset} disabled={!MY_ASSIGNEE} />            <PresetButton
              active={normalizedSearch.length === 0 && attentionFilter === "needs-attention" && queueFilter === "all" && ageFilter === "all" && stageFilter === "all" && outcomeFilter === "all" && assigneeFilter === "all" && sort === "oldest-assigned"}
              label="Action needed"
              onClick={() => {
                const next = attentionFilter === "needs-attention" ? "all" : "needs-attention";

                setSearch("");
                setQueueFilter("all");
                setAgeFilter("all");
                setStageFilter("all");
                setOutcomeFilter("all");
                setAssigneeFilter("all");
                setSort("oldest-assigned");
                setAttentionFilter(next);

                updateUrl({
                  q: "",
                  queue: "all",
                  age: "all",
                  stage: "all",
                  outcome: "all",
                  assignee: "all",
                  sort: "oldest-assigned",
                  attention: next
                });
              }}
            />
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
              Reset to All
            </button>
          ) : null}
        </div>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13 }}>
          {activePresetLabel ? (
            <span style={{ color: "#374151" }}>
              Preset: <span style={{ fontWeight: 700 }}>{activePresetLabel}</span>
            </span>
          ) : hasCustomFilters ? (
            <span style={{ color: "#92400e", fontWeight: 600 }}>Custom filters active</span>
          ) : (
            <span style={{ color: "#6b7280" }}>No filters applied</span>
          )}

          <div
            style={{
              fontSize: 12,
              color: "#4b5563",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              padding: "8px 10px",
              display: "grid",
              gap: 2
            }}
          >
            <div style={{ fontWeight: 700, color: "#111827" }}>{queueContextHint.title}</div>
            <div>{queueContextHint.message}</div>
          </div>

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

            {attentionFilter !== "all" ? (
              <button
                type="button"
                onClick={() => {
                  setAttentionFilter("all");
                  updateUrl({ attention: "all" });
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
                Action needed ×
              </button>
            ) : null}

            {sort !== "oldest-assigned" ? (
              <button
                type="button"
                onClick={() => {
                  setSort("oldest-assigned");
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
              ref={searchInputRef}
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
            <span style={{ fontSize: 12, color: "#6b7280" }}>Press / to focus search</span>
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
          {filteredItems.length === items.length
            ? `Showing all ${items.length} followups.`
            : `Showing ${filteredItems.length} of ${items.length} followups.`}
        </div>
      </div>

      {filteredItems.length === 0 && items.length > 0 ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            padding: 16,
            display: "grid",
            gap: 10
          }}
        >
          <div style={{ display: "grid", gap: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>No followups match the current filters.</div>
            <div style={{ fontSize: 13, color: "#6b7280" }}>
              Try clearing search, removing a filter chip, or reset back to the All preset.
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={applyAllPreset}
              style={{
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer"
              }}
            >
              Reset to All
            </button>

            {normalizedSearch ? (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  updateUrl({ q: "" });
                  searchInputRef.current?.focus();
                }}
                style={{
                  border: "1px solid #d1d5db",
                  background: "#f9fafb",
                  color: "#111827",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Clear search
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <FollowupsTable
        returnTo={currentFollowupsUrl}
        items={filteredItems}
        queueFilter={queueFilter}
        assigneeFilter={assigneeFilter}
        ageFilter={ageFilter}
        stageFilter={stageFilter}
        outcomeFilter={outcomeFilter}
        sort={sort}
        editingVisitorId={editingVisitorId}
        editingOutcome={editingOutcome}
        editingNote={editingNote}
        isSavingOutcome={isSavingOutcome}
        isOutcomeSuccess={isOutcomeSuccess}
        outcomeError={outcomeError}
        onQueueSelect={(value) => {
          setSearch("");
          setQueueFilter(value);
          setAgeFilter("all");
          setStageFilter("all");
          setOutcomeFilter("all");
          setAssigneeFilter("all");
          setAttentionFilter("all");
          setSort("oldest-assigned");
          updateUrl({
            q: "",
            queue: value,
            age: "all",
            stage: "all",
            outcome: "all",
            assignee: "all",
            attention: "all",
            sort: "oldest-assigned"
          });
        }}
        onAssigneeSelect={(value) => {
          setSearch("");
          setQueueFilter("all");
          setAgeFilter("all");
          setStageFilter("all");
          setOutcomeFilter("all");
          setAssigneeFilter(value);
          setAttentionFilter("all");
          setSort("oldest-assigned");
          updateUrl({
            q: "",
            queue: "all",
            age: "all",
            stage: "all",
            outcome: "all",
            assignee: value,
            attention: "all",
            sort: "oldest-assigned"
          });
        }}
        onAgeSelect={(value) => {
          setSearch("");
          setQueueFilter("action-needed");
          setAgeFilter(value);
          setStageFilter("all");
          setSort("oldest-assigned");
          setOutcomeFilter("all");
          setAssigneeFilter("all");
          setAttentionFilter("all");
          updateUrl({
            q: "",
            queue: "action-needed",
            age: value,
            stage: "all",
            outcome: "all",
            assignee: "all",
            attention: "all",
            sort: "oldest-assigned"
          });
        }}
        onStageSelect={(value) => {
          setSearch("");
          setQueueFilter("all");
          setAgeFilter("all");
          setStageFilter(value);
          setOutcomeFilter("all");
          setAssigneeFilter("all");
          setAttentionFilter("all");
          setSort("oldest-assigned");
          updateUrl({
            q: "",
            queue: "all",
            age: "all",
            stage: value,
            outcome: "all",
            assignee: "all",
            attention: "all",
            sort: "oldest-assigned"
          });
        }}
        onOutcomeSelect={(value) => {
          setSearch("");
          setQueueFilter("all");
          setAgeFilter("all");
          setStageFilter("all");
          setOutcomeFilter(value);
          setAssigneeFilter("all");
          setAttentionFilter("all");
          setSort("oldest-assigned");
          updateUrl({
            q: "",
            queue: "all",
            age: "all",
            stage: "all",
            outcome: value,
            assignee: "all",
            attention: "all",
            sort: "oldest-assigned"
          });
        }}
        onSortSelect={(value) => {
          setSort(value);
          updateUrl({ sort: value });
        }}
        onStartOutcomeEdit={startOutcomeEdit}
        onCancelOutcomeEdit={cancelOutcomeEdit}
        onEditingOutcomeChange={setEditingOutcome}
        onEditingNoteChange={setEditingNote}
        onSaveOutcome={saveOutcome}
        onQuickOutcome={(visitorId, outcome) => void saveOutcome(visitorId, { outcome, note: "" })}
      />
    </section>
  );
}












