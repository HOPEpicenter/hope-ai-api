import Link from "next/link";
import { FollowupAssignButton } from "@/components/followup-assign-button";
import { FollowupUnassignButton } from "@/components/followup-unassign-button";
import { FollowupContactButton } from "@/components/followup-contact-button";
import { FollowupRowActionGroup } from "@/components/followup-row-action-ui";
import type { CSSProperties } from "react";
import type { FollowupItem } from "@/lib/contracts/followups";
import { CopyButton } from "@/components/copy-button";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

const ROW_OUTCOME_OPTIONS = [
  { value: "CONNECTED", label: "Connected" },
  { value: "LEFT_VOICEMAIL", label: "Left voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "FOLLOW_UP_LATER", label: "Follow up later" }
] as const;

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
  editingVisitorId,
  editingOutcome,
  editingNote,
  isSavingOutcome,
  outcomeError,
  onQueueSelect,
  onAssigneeSelect,
  onAgeSelect,
  onStageSelect,
  onOutcomeSelect,
  onSortSelect,
  onStartOutcomeEdit,
  onCancelOutcomeEdit,
  onEditingOutcomeChange,
  onEditingNoteChange,
  onSaveOutcome,
  onQuickOutcome
}: {
  items: FollowupItem[];
  queueFilter: "all" | "action-needed" | "contact-made";
  assigneeFilter: string;
  ageFilter: string;
  stageFilter: string;
  outcomeFilter: string;
  sort: "oldest-assigned" | "newest-assigned" | "last-contact";
  editingVisitorId: string | null;
  editingOutcome: string;
  editingNote: string;
  isSavingOutcome: boolean;
  outcomeError: string | null;
  onQueueSelect: (value: "action-needed" | "contact-made") => void;
  onAssigneeSelect: (value: string) => void;
  onAgeSelect: (value: "24h+" | "48h+" | "72h+") => void;
  onStageSelect: (value: "guest" | "connected" | "member" | "unknown") => void;
  onOutcomeSelect: (value: string) => void;
  onSortSelect: (value: "oldest-assigned" | "newest-assigned" | "last-contact") => void;
  onStartOutcomeEdit: (visitorId: string) => void;
  onCancelOutcomeEdit: () => void;
  onEditingOutcomeChange: (value: string) => void;
  onEditingNoteChange: (value: string) => void;
  onSaveOutcome: (visitorId: string) => Promise<void>;
  onQuickOutcome: (visitorId: string, outcome: string) => void;
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

            const isEditing = editingVisitorId === item.visitorId;
            const hasRecordedOutcome = Boolean(item.lastFollowupOutcome);
            const showQuickOutcomeButtons = !hasRecordedOutcome;
            const disableQuickOutcomeButtons = isSavingOutcome;

            return (
              <tr key={item.visitorId} style={rowStyle}>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
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
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
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
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <StageBadge
                    stage={item.stage}
                    stageFilter={stageFilter}
                    onStageSelect={onStageSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <Badge
                    needsFollowup={item.needsFollowup}
                    queueFilter={queueFilter}
                    onQueueSelect={onQueueSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <AgingBadge
                    assignedAt={item.lastFollowupAssignedAt}
                    needsFollowup={item.needsFollowup}
                    ageFilter={ageFilter}
                    onAgeSelect={onAgeSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <LastAssignedButton
                    value={item.lastFollowupAssignedAt}
                    sort={sort}
                    onSortSelect={onSortSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <LastContactButton
                    value={item.lastFollowupContactedAt}
                    sort={sort}
                    onSortSelect={onSortSelect}
                  />
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
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
                    <div style={{ color: "#6b7280" }}>No outcome</div>
                  )}
                </td>
                <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}>
                  <FollowupRowActionGroup>
                    <div style={{ display: "grid", gap: 8 }}>
                      {item.needsFollowup ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            width: "fit-content",
                            padding: "4px 8px",
                            borderRadius: 999,
                            background: "#fef3c7",
                            color: "#92400e",
                            border: "1px solid #fcd34d",
                            fontSize: 12,
                            fontWeight: 700
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: 999,
                              background: "#f59e0b",
                              display: "inline-block"
                            }}
                          />
                          Needs attention
                        </div>
                      ) : null}

                      {isEditing ? (
                        <div
                          style={{
                            display: "grid",
                            gap: 8,
                            minWidth: 240,
                            padding: 12,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            background: "#f9fafb"
                          }}
                        >
                          <select
                            value={editingOutcome}
                            onChange={(event) => onEditingOutcomeChange(event.target.value)}
                            disabled={isSavingOutcome}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              color: "#111827"
                            }}
                          >
                            {ROW_OUTCOME_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>

                          <textarea
                            value={editingNote}
                            onChange={(event) => onEditingNoteChange(event.target.value)}
                            disabled={isSavingOutcome}
                            rows={2}
                            placeholder="Optional note"
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              color: "#111827",
                              resize: "vertical"
                            }}
                          />

                          {outcomeError ? (
                            <div
                              style={{
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                color: "#991b1b",
                                borderRadius: 8,
                                padding: 8,
                                fontSize: 12,
                                fontWeight: 600
                              }}
                            >
                              {outcomeError}
                            </div>
                          ) : null}

                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => void onSaveOutcome(item.visitorId)}
                              disabled={isSavingOutcome}
                              style={{
                                background: "#111827",
                                color: "#fff",
                                border: "1px solid #111827",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isSavingOutcome ? "not-allowed" : "pointer",
                                opacity: isSavingOutcome ? 0.7 : 1
                              }}
                            >
                              {isSavingOutcome ? "Saving..." : "Save"}
                            </button>

                            <button
                              type="button"
                              onClick={onCancelOutcomeEdit}
                              disabled={isSavingOutcome}
                              style={{
                                background: "#fff",
                                color: "#111827",
                                border: "1px solid #d1d5db",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: isSavingOutcome ? "not-allowed" : "pointer"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : null}

                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                          padding: item.needsFollowup ? 10 : 0,
                          borderRadius: item.needsFollowup ? 10 : 0,
                          background: item.needsFollowup ? "#fff7ed" : "transparent",
                          border: item.needsFollowup ? "1px solid #fed7aa" : "none"
                        }}
                      >
                        <FollowupAssignButton
                          visitorId={item.visitorId}
                          assignedToOwnerId={item.assignedTo?.ownerId ?? null}
                          needsFollowup={item.needsFollowup}
                        />
                        <FollowupUnassignButton
                          visitorId={item.visitorId}
                          assignedToOwnerId={item.assignedTo?.ownerId ?? null}
                        />
                        <FollowupContactButton visitorId={item.visitorId} needsFollowup={item.needsFollowup} />
                        {!isEditing ? (
                          <>
                            {showQuickOutcomeButtons ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => onQuickOutcome(item.visitorId, "CONNECTED")}
                                  disabled={disableQuickOutcomeButtons}
                                  style={{
                                    background: "#ecfdf5",
                                    color: "#166534",
                                    border: "1px solid #bbf7d0",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: disableQuickOutcomeButtons ? "not-allowed" : "pointer",
                                    opacity: disableQuickOutcomeButtons ? 0.7 : 1
                                  }}
                                >
                                  Connected
                                </button>

                                <button
                                  type="button"
                                  onClick={() => onQuickOutcome(item.visitorId, "NO_ANSWER")}
                                  disabled={disableQuickOutcomeButtons}
                                  style={{
                                    background: "#fef2f2",
                                    color: "#991b1b",
                                    border: "1px solid #fecaca",
                                    borderRadius: 8,
                                    padding: "8px 12px",
                                    fontSize: 12,
                                    fontWeight: 600,
                                    cursor: disableQuickOutcomeButtons ? "not-allowed" : "pointer",
                                    opacity: disableQuickOutcomeButtons ? 0.7 : 1
                                  }}
                                >
                                  No answer
                                </button>
                              </>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => onStartOutcomeEdit(item.visitorId)}
                              style={{
                                background: "#fff",
                                color: "#111827",
                                border: "1px solid #d1d5db",
                                borderRadius: 8,
                                padding: "8px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: "pointer"
                              }}
                            >
                              More…
                            </button>
                          </>
                        ) : null}
                        <CopyButton value={item.visitorId} label="Copy ID" />
                      </div>
                    </div>
                  </FollowupRowActionGroup>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

