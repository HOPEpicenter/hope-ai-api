import Link from "next/link";
import type { CSSProperties } from "react";
import type { FollowupItem } from "@/lib/contracts/followups";
import { CopyButton } from "@/components/copy-button";
function EmptyStatePanel({
  title,
  message
}: {
  title: string;
  message: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 24,
        display: "grid",
        gap: 6
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, color: "#111827" }}>{title}</div>
      <div style={{ fontSize: 14, color: "#6b7280" }}>{message}</div>
    </div>
  );
}
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function toTimestamp(value: string | null | undefined, fallback = Number.MAX_SAFE_INTEGER) {
  if (!value) return fallback;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? fallback : time;
}

function Badge({
  needsFollowup,
  queueFilter,
  onQueueSelect
}: {
  needsFollowup: boolean;
  queueFilter: "all" | "action-needed" | "contact-made";
  onQueueSelect: (value: "action-needed" | "contact-made") => void;
}) {
  const value = needsFollowup ? "action-needed" : "contact-made";

  const style: CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    background: needsFollowup ? "#fef3c7" : "#dcfce7",
    color: "#111827",
    border: queueFilter === value ? "1px solid #111827" : "1px solid transparent",
    cursor: "pointer"
  };

  return (
    <button
      type="button"
      onClick={() => onQueueSelect(value)}
      style={style}
    >
      {needsFollowup ? "Action needed" : "Contact made"}
    </button>
  );
}

function getFollowupAgeHours(value: string | null | undefined): number | null {
  if (!value) return null;
  const assignedMs = new Date(value).getTime();
  if (Number.isNaN(assignedMs)) return null;

  const diffMs = Date.now() - assignedMs;
  if (diffMs < 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60));
}

function AgingBadge({
  assignedAt,
  needsFollowup,
  ageFilter,
  onAgeSelect
}: {
  assignedAt: string | null | undefined;
  needsFollowup: boolean;
  ageFilter: string;
  onAgeSelect: (value: "24h+" | "48h+" | "72h+") => void;
}) {
  if (!needsFollowup) {
    return null;
  }

  const hours = getFollowupAgeHours(assignedAt);
  if (hours === null) {
    return null;
  }

  let label = "New";
  let background = "#e5e7eb";
  let color = "#374151";

  if (hours >= 72) {
    label = "72h+";
    background = "#fee2e2";
    color = "#991b1b";
  } else if (hours >= 48) {
    label = "48h+";
    background = "#ffedd5";
    color = "#9a3412";
  } else if (hours >= 24) {
    label = "24h+";
    background = "#fef3c7";
    color = "#92400e";
  }

  const style: CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    background,
    color,
    border: label === ageFilter ? "1px solid #111827" : "1px solid transparent",
    cursor: label === "New" ? "default" : "pointer"
  };

  if (label === "New") {
    return <span style={style}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onAgeSelect(label as "24h+" | "48h+" | "72h+")}
      style={style}
    >
      {label}
    </button>
  );
}

function StageBadge({
  stage,
  stageFilter,
  onStageSelect
}: {
  stage: string | null | undefined;
  stageFilter: string;
  onStageSelect: (value: "guest" | "connected" | "member" | "unknown") => void;
}) {
  const base: CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600
  };

  if (!stage) {
    return (
      <button
        type="button"
        onClick={() => onStageSelect("unknown")}
        style={{
          ...base,
          background: "#f3f4f6",
          color: "#374151",
          border: stageFilter === "unknown" ? "1px solid #111827" : "1px solid transparent",
          cursor: "pointer"
        }}
      >
        Unknown
      </button>
    );
  }

  const s = stage.toLowerCase();

  if (s === "guest") {
    return (
      <button
        type="button"
        onClick={() => onStageSelect("guest")}
        style={{
          ...base,
          background: "#f3f4f6",
          color: "#374151",
          border: stageFilter === "guest" ? "1px solid #111827" : "1px solid transparent",
          cursor: "pointer"
        }}
      >
        Guest
      </button>
    );
  }

  if (s === "connected") {
    return (
      <button
        type="button"
        onClick={() => onStageSelect("connected")}
        style={{
          ...base,
          background: "#dbeafe",
          color: "#1e40af",
          border: stageFilter === "connected" ? "1px solid #111827" : "1px solid transparent",
          cursor: "pointer"
        }}
      >
        Connected
      </button>
    );
  }

  if (s === "member") {
    return (
      <button
        type="button"
        onClick={() => onStageSelect("member")}
        style={{
          ...base,
          background: "#dcfce7",
          color: "#166534",
          border: stageFilter === "member" ? "1px solid #111827" : "1px solid transparent",
          cursor: "pointer"
        }}
      >
        Member
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onStageSelect("unknown")}
      style={{
        ...base,
        background: "#f3f4f6",
        color: "#374151",
        border: stageFilter === "unknown" ? "1px solid #111827" : "1px solid transparent",
        cursor: "pointer"
      }}
    >
      {stage}
    </button>
  );
}

function renderTimeCell(value: string | null | undefined, emptyLabel: string) {
  if (!value) {
    return <span style={{ color: "#6b7280" }}>{emptyLabel}</span>;
  }

  return formatRelativeTime(value);
}

function LastAssignedButton({
  value,
  sort,
  onSortSelect
}: {
  value: string | null | undefined;
  sort: "oldest-assigned" | "newest-assigned" | "last-contact";
  onSortSelect: (value: "oldest-assigned" | "newest-assigned" | "last-contact") => void;
}) {
  if (!value) {
    return <span style={{ color: "#6b7280" }}>Not assigned</span>;
  }

  const nextSort = sort === "newest-assigned" ? "oldest-assigned" : "newest-assigned";
  const active = sort === "oldest-assigned" || sort === "newest-assigned";
  const modeLabel = sort === "newest-assigned" ? "Newest first" : "Oldest first";

  return (
    <button
      type="button"
      onClick={() => onSortSelect(nextSort)}
      title={formatAbsoluteTime(value)}
      style={{
        border: active ? "1px solid #111827" : "1px solid #d1d5db",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      {formatRelativeTime(value)} · {modeLabel}
    </button>
  );
}

function LastContactButton({
  value,
  sort,
  onSortSelect
}: {
  value: string | null | undefined;
  sort: "oldest-assigned" | "newest-assigned" | "last-contact";
  onSortSelect: (value: "oldest-assigned" | "newest-assigned" | "last-contact") => void;
}) {
  if (!value) {
    return <span style={{ color: "#6b7280" }}>Never contacted</span>;
  }

  return (
    <button
      type="button"
      onClick={() => onSortSelect("last-contact")}
      title={formatAbsoluteTime(value)}
      style={{
        border: sort === "last-contact" ? "1px solid #111827" : "1px solid #d1d5db",
        background: sort === "last-contact" ? "#111827" : "#fff",
        color: sort === "last-contact" ? "#fff" : "#111827",
        borderRadius: 999,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer"
      }}
    >
      {formatRelativeTime(value)}
    </button>
  );
}

function normalizeOutcomeValue(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getOutcomeBadgeColors(value: string | null | undefined) {
  const normalized = normalizeOutcomeValue(value);

  if (normalized === "connected") {
    return { background: "#dcfce7", color: "#166534", border: "#bbf7d0" };
  }

  if (normalized === "left_message") {
    return { background: "#dbeafe", color: "#1d4ed8", border: "#bfdbfe" };
  }

  if (normalized === "no_response") {
    return { background: "#fee2e2", color: "#991b1b", border: "#fecaca" };
  }

  if (normalized === "closed") {
    return { background: "#e5e7eb", color: "#374151", border: "#d1d5db" };
  }

  if (normalized === "needs_care") {
    return { background: "#fef3c7", color: "#92400e", border: "#fde68a" };
  }

  return { background: "#f3f4f6", color: "#374151", border: "#d1d5db" };
}

function formatOutcomeLabel(value: string | null | undefined) {
  if (!value) {
    return <span style={{ color: "#6b7280" }}>No outcome</span>;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "connected") return "Connected";
  if (normalized === "left_message") return "Left message";
  if (normalized === "no_response") return "No response";
  if (normalized === "closed") return "Closed";
  if (normalized === "needs_care") return "Needs care";

  return value;
}

export function FollowupsTable({
  items,
  queueFilter,
  assigneeFilter,
  ageFilter,
  stageFilter,
  outcomeFilter,
  sort,
  onQueueSelect,
  onAssigneeSelect,
  onAgeSelect,
  onStageSelect,
  onOutcomeSelect,
  onSortSelect
}: {
  items: FollowupItem[];
  queueFilter: "all" | "action-needed" | "contact-made";
  assigneeFilter: string;
  ageFilter: string;
  stageFilter: string;
  outcomeFilter: string;
  sort: "oldest-assigned" | "newest-assigned" | "last-contact";
  onQueueSelect: (value: "action-needed" | "contact-made") => void;
  onAssigneeSelect: (value: string) => void;
  onAgeSelect: (value: "24h+" | "48h+" | "72h+") => void;
  onStageSelect: (value: "guest" | "connected" | "member" | "unknown") => void;
  onOutcomeSelect: (value: string) => void;
  onSortSelect: (value: "oldest-assigned" | "newest-assigned" | "last-contact") => void;
}) {
  if (items.length === 0) {
    const hasFilters =
      queueFilter !== "all" ||
      assigneeFilter !== "all" ||
      ageFilter !== "all" ||
      stageFilter !== "all" ||
      outcomeFilter !== "all";

    return hasFilters ? (
      <EmptyStatePanel
        title="No matching followups"
        message="Try clearing or adjusting the current filters to see more results."
      />
    ) : (
      <EmptyStatePanel
        title="No followups yet"
        message="New followups will appear here when action is required."
      />
    );
  }

  const sortedItems = [...items].sort((a, b) => {
    if (a.needsFollowup !== b.needsFollowup) {
      return a.needsFollowup ? -1 : 1;
    }

    const contactedDiff =
      toTimestamp(a.lastFollowupContactedAt) - toTimestamp(b.lastFollowupContactedAt);
    if (contactedDiff !== 0) return contactedDiff;

    const assignedDiff =
      toTimestamp(a.lastFollowupAssignedAt) - toTimestamp(b.lastFollowupAssignedAt);
    if (assignedDiff !== 0) return assignedDiff;

    return a.visitorId.localeCompare(b.visitorId);
  });

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned To</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Stage</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Queue State</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Age</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Assigned</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Contact</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Outcome</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => {
            const rowStyle: CSSProperties = item.needsFollowup
              ? { background: "#fffbeb", boxShadow: "inset 4px 0 0 #f59e0b" }
              : {};

            return (
              <tr key={item.visitorId} style={rowStyle}>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      href={`/visitors/${item.visitorId}`}
                      style={{
                        color: "inherit",
                        textDecoration: "none",
                        display: "inline-block",
                        cursor: "pointer"
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{item.visitorId}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>Visitor ID</div>
                    </Link>
                    <CopyButton value={item.visitorId} label="Copy" />
                  </div>
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {item.assignedTo?.ownerId ? (
                    <button
                      type="button"
                      onClick={() => onAssigneeSelect(item.assignedTo?.ownerId ?? "all")}
                      style={{
                        border: item.assignedTo.ownerId === assigneeFilter ? "1px solid #111827" : "1px solid #d1d5db",
                        background: item.assignedTo.ownerId === assigneeFilter ? "#111827" : "#fff",
                        color: item.assignedTo.ownerId === assigneeFilter ? "#fff" : "#111827",
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      {item.assignedTo.ownerId}
                    </button>
                  ) : (
                    "-"
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <StageBadge
                    stage={item.stage}
                    stageFilter={stageFilter}
                    onStageSelect={onStageSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <Badge
                    needsFollowup={item.needsFollowup}
                    queueFilter={queueFilter}
                    onQueueSelect={onQueueSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <AgingBadge
                    assignedAt={item.lastFollowupAssignedAt}
                    needsFollowup={item.needsFollowup}
                    ageFilter={ageFilter}
                    onAgeSelect={onAgeSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <LastAssignedButton
                    value={item.lastFollowupAssignedAt}
                    sort={sort}
                    onSortSelect={onSortSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <LastContactButton
                    value={item.lastFollowupContactedAt}
                    sort={sort}
                    onSortSelect={onSortSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  {item.lastFollowupOutcome ? (
                    <button
                      type="button"
                      onClick={() => onOutcomeSelect(normalizeOutcomeValue(item.lastFollowupOutcome))}
                      style={{
                        border:
                          normalizeOutcomeValue(item.lastFollowupOutcome) === outcomeFilter
                            ? "1px solid #111827"
                            : "1px solid " + getOutcomeBadgeColors(item.lastFollowupOutcome).border,
                        background: getOutcomeBadgeColors(item.lastFollowupOutcome).background,
                        color: getOutcomeBadgeColors(item.lastFollowupOutcome).color,
                        borderRadius: 999,
                        padding: "6px 10px",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      {formatOutcomeLabel(item.lastFollowupOutcome)}
                    </button>
                  ) : (
                    formatOutcomeLabel(item.lastFollowupOutcome)
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                  <CopyButton value={item.visitorId} label="Copy ID" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}




























