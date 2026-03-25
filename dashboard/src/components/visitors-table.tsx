"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CopyButton } from "@/components/copy-button";
import { PageState } from "@/components/page-state";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";
import type { VisitorListItem } from "@/lib/contracts/visitors";

export type VisitorsTableItem = VisitorListItem & {
  followupState: "Assigned" | "Waiting assignment" | "Contacted";
  attentionState: "Needs attention" | "Contact made" | null;
  assignedTo: string | null;
};

type VisitorsPreset = "all" | "my-needs-attention" | "waiting-assignment" | "assigned-to-me" | "assigned" | "contacted" | "needs-attention";

type AssignFollowupResponse = {
  ok?: boolean;
  error?: string;
};

type ContactFollowupResponse = {
  ok?: boolean;
  visitorId?: string;
  error?: string;
};

type OutcomeFollowupResponse = {
  ok?: boolean;
  visitorId?: string;
  eventType?: string;
  outcome?: string;
  error?: string;
};

const OUTCOME_OPTIONS = [
  { value: "CONNECTED", label: "Connected" },
  { value: "LEFT_VOICEMAIL", label: "Left voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "FOLLOW_UP_LATER", label: "Follow up later" }
] as const;

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getAttentionRank(attentionState: VisitorsTableItem["attentionState"]) {
  switch (attentionState) {
    case "Needs attention":
      return 0;
    case "Contact made":
      return 1;
    default:
      return 2;
  }
}

function getFollowupStateRank(state: VisitorsTableItem["followupState"]) {
  switch (state) {
    case "Waiting assignment":
      return 0;
    case "Assigned":
      return 1;
    case "Contacted":
      return 2;
    default:
      return 99;
  }
}

function FollowupStateBadge({ state }: { state: VisitorsTableItem["followupState"] }) {
  const background =
    state === "Waiting assignment"
      ? "#fef3c7"
      : state === "Assigned"
        ? "#dbeafe"
        : "#dcfce7";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background,
        color: "#111827"
      }}
    >
      {state}
    </span>
  );
}

function AttentionBadge({ state }: { state: VisitorsTableItem["attentionState"] }) {
  if (!state) {
    return <span style={{ color: "#9ca3af" }}>-</span>;
  }

  const background = state === "Needs attention" ? "#fee2e2" : "#e0f2fe";
  const color = state === "Needs attention" ? "#991b1b" : "#0c4a6e";

  const badgeStyle = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    background,
    color,
    textDecoration: "none"
  } as const;

  if (state !== "Needs attention") {
    return <span style={badgeStyle}>{state}</span>;
  }

  return (
    <Link href="/visitors?preset=needs-attention" style={badgeStyle}>
      {state}
    </Link>
  );
}

function PresetButton({
  active,
  disabled,
  href,
  label
}: {
  active: boolean;
  disabled?: boolean;
  href: string;
  label: string;
}) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled={true}
        style={{
          padding: "8px 12px",
          borderRadius: 10,
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#111827",
          fontWeight: 600,
          cursor: "not-allowed",
          opacity: 0.5
        }}
      >
        {label}
      </button>
    );
  }

  return (
    <Link
      href={href}
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: active ? "1px solid #111827" : "1px solid #d1d5db",
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#111827",
        fontWeight: 600,
        textDecoration: "none"
      }}
    >
      {label}
    </Link>
  );
}

function PresetScopeChip({ myAssignee }: { myAssignee: string }) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 12px",
        borderRadius: 9999,
        background: "#eff6ff",
        border: "1px solid #bfdbfe",
        color: "#1e40af",
        fontSize: 12,
        fontWeight: 600
      }}
    >
      <span>Scoped to:</span>
      <span>{myAssignee}</span>
    </div>
  );
}

function ClearPresetLink() {
  return (
    <Link
      href="/visitors"
      style={{
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#111827",
        fontWeight: 600,
        textDecoration: "none"
      }}
    >
      Clear preset
    </Link>
  );
}

export function VisitorsTable({
  items,
  preset,
  myAssignee,
  allCount,
  myNeedsAttentionCount,
  assignedToMeCount,
  assignedCount,
  contactedCount,
  needsAttentionCount
}: {
  items: VisitorsTableItem[];
  preset: VisitorsPreset;
  myAssignee: string;
  allCount: number;
  myNeedsAttentionCount: number;
  assignedToMeCount: number;
  assignedCount: number;
  contactedCount: number;
  needsAttentionCount: number;
}) {
  const router = useRouter();
  const [assigningVisitorId, setAssigningVisitorId] = useState<string | null>(null);
  const [contactingVisitorId, setContactingVisitorId] = useState<string | null>(null);
  const [editingOutcomeVisitorId, setEditingOutcomeVisitorId] = useState<string | null>(null);
  const [savingOutcomeVisitorId, setSavingOutcomeVisitorId] = useState<string | null>(null);
  const [draftOutcome, setDraftOutcome] = useState<string>(OUTCOME_OPTIONS[0].value);
  const [draftNote, setDraftNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  async function assignToMe(visitorId: string) {
    if (!myAssignee) {
      setActionError("Assign to me is unavailable until NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE is configured.");
      return;
    }

    setAssigningVisitorId(visitorId);
    setActionError(null);

    try {
      const response = await fetch("/api/dashboard/followups/assign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          assigneeId: myAssignee
        })
      });

      const data = (await response.json()) as AssignFollowupResponse;

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/assign failed with status ${response.status}`);
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign visitor.";
      setActionError(message);
    } finally {
      setAssigningVisitorId(null);
    }
  }

  async function markContacted(visitorId: string) {
    setContactingVisitorId(visitorId);
    setActionError(null);

    try {
      const response = await fetch("/api/dashboard/followups/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId
        })
      });

      const data = (await response.json()) as ContactFollowupResponse;

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/contact failed with status ${response.status}`);
      }

      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to mark contacted.";
      setActionError(message);
    } finally {
      setContactingVisitorId(null);
    }
  }

  function startOutcomeEditor(visitorId: string) {
    setEditingOutcomeVisitorId(visitorId);
    setDraftOutcome(OUTCOME_OPTIONS[0].value);
    setDraftNote("");
    setActionError(null);
  }

  function cancelOutcomeEditor() {
    setEditingOutcomeVisitorId(null);
    setDraftOutcome(OUTCOME_OPTIONS[0].value);
    setDraftNote("");
  }

  async function saveOutcome(visitorId: string) {
    setSavingOutcomeVisitorId(visitorId);
    setActionError(null);

    try {
      const response = await fetch("/api/dashboard/followups/outcome", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          outcome: draftOutcome,
          note: draftNote
        })
      });

      const data = (await response.json()) as OutcomeFollowupResponse;

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/outcome failed with status ${response.status}`);
      }

      setEditingOutcomeVisitorId(null);
      setDraftOutcome(OUTCOME_OPTIONS[0].value);
      setDraftNote("");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to record followup outcome.";
      setActionError(message);
    } finally {
      setSavingOutcomeVisitorId(null);
    }
  }

  const waitingAssignmentCount = items.filter((item) => !item.assignedTo).length;

  const filteredItems =
    preset === "my-needs-attention" && myAssignee
      ? items.filter(
          (item) =>
            item.attentionState === "Needs attention" &&
            item.assignedTo === myAssignee
        )
      : preset === "waiting-assignment"
        ? items.filter((item) => !item.assignedTo)
        : preset === "assigned-to-me" && myAssignee
          ? items.filter((item) => item.assignedTo === myAssignee)
          : preset === "assigned"
            ? items.filter((item) => !!item.assignedTo)
            : preset === "contacted"
              ? items.filter((item) => item.followupState === "Contacted")
              : preset === "needs-attention"
                ? items.filter((item) => item.attentionState === "Needs attention")
                : items;

  if (filteredItems.length === 0) {
    return (
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <PresetButton active={preset === "all"} href="/visitors" label={`All (${allCount})`} />
          <PresetButton
            active={preset === "my-needs-attention"}
            href="/visitors?preset=my-needs-attention"
            label={`My Needs Attention (${myNeedsAttentionCount})`}
            disabled={!myAssignee}
          />
          <PresetButton
            active={preset === "waiting-assignment"}
            href="/visitors?preset=waiting-assignment"
            label={`Waiting Assignment (${waitingAssignmentCount})`}
          />
          <PresetButton
            active={preset === "assigned-to-me"}
            href="/visitors?preset=assigned-to-me"
            label={`Assigned To Me (${assignedToMeCount})`}
            disabled={!myAssignee}
          />
          <PresetButton
            active={preset === "assigned"}
            href="/visitors?preset=assigned"
            label={`Assigned (${assignedCount})`}
          />
          <PresetButton
            active={preset === "contacted"}
            href="/visitors?preset=contacted"
            label={`Contacted (${contactedCount})`}
          />
          <PresetButton
            active={preset === "needs-attention"}
            href="/visitors?preset=needs-attention"
            label={`Needs Attention (${needsAttentionCount})`}
          />
          {(preset === "my-needs-attention" || preset === "assigned-to-me") && myAssignee ? (
            <PresetScopeChip myAssignee={myAssignee} />
          ) : null}
          {preset !== "all" ? <ClearPresetLink /> : null}
        </div>

        {preset === "my-needs-attention" && myAssignee ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {myNeedsAttentionCount} visitors that need attention for {myAssignee}.
          </div>
        ) : preset === "waiting-assignment" ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {waitingAssignmentCount} visitors waiting for assignment.
          </div>
        ) : preset === "assigned-to-me" && myAssignee ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {assignedToMeCount} visitors assigned to {myAssignee}.
          </div>
        ) : preset === "assigned" ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {assignedCount} assigned visitors.
          </div>
        ) : preset === "contacted" ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {contactedCount} contacted visitors.
          </div>
        ) : preset === "needs-attention" ? (
          <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
            Showing {needsAttentionCount} visitors that need attention.
          </div>
        ) : null}

        <PageState
          title={
            preset === "my-needs-attention"
              ? "No matching visitors"
              : preset === "waiting-assignment"
                ? "No visitors waiting for assignment"
                : preset === "assigned-to-me"
                  ? "No visitors assigned to you"
                  : preset === "assigned"
                    ? "No assigned visitors"
                    : preset === "contacted"
                      ? "No contacted visitors"
                      : preset === "needs-attention"
                        ? "No visitors need attention"
                        : "No visitors yet"
          }
          message={
            preset === "my-needs-attention"
              ? myAssignee
                ? `No visitors currently need attention for assignee ${myAssignee}.`
                : "My Needs Attention is unavailable until NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE is configured."
              : preset === "waiting-assignment"
                ? "All visitors currently have an assignee or have already been contacted."
                : preset === "assigned-to-me"
                  ? myAssignee
                    ? `No visitors are currently assigned to ${myAssignee}.`
                    : "Assigned To Me is unavailable until NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE is configured."
                  : preset === "assigned"
                    ? "No visitors are currently assigned."
                    : preset === "contacted"
                      ? "No visitors have been contacted yet."
                      : preset === "needs-attention"
                        ? "No visitors currently need attention."
                        : "Visitor records will appear here once someone interacts with the system."
          }
          actionHref={preset !== "all" ? "/visitors" : "/overview"}
          actionLabel={preset !== "all" ? "Show all visitors" : "Back to overview"}
        />
      </div>
    );
  }

  const sortedItems = [...filteredItems].sort((a, b) => {
    const attentionRankDiff = getAttentionRank(a.attentionState) - getAttentionRank(b.attentionState);
    if (attentionRankDiff !== 0) {
      return attentionRankDiff;
    }

    const stateRankDiff = getFollowupStateRank(a.followupState) - getFollowupStateRank(b.followupState);
    if (stateRankDiff !== 0) {
      return stateRankDiff;
    }

    const timeDiff = toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt);
    if (timeDiff !== 0) return timeDiff;

    return a.visitorId.localeCompare(b.visitorId);
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <PresetButton active={preset === "all"} href="/visitors" label={`All (${allCount})`} />
        <PresetButton
          active={preset === "my-needs-attention"}
          href="/visitors?preset=my-needs-attention"
          label={`My Needs Attention (${myNeedsAttentionCount})`}
          disabled={!myAssignee}
        />
        <PresetButton
          active={preset === "waiting-assignment"}
          href="/visitors?preset=waiting-assignment"
          label={`Waiting Assignment (${waitingAssignmentCount})`}
        />
        <PresetButton
          active={preset === "assigned-to-me"}
          href="/visitors?preset=assigned-to-me"
          label={`Assigned To Me (${assignedToMeCount})`}
          disabled={!myAssignee}
        />
        <PresetButton
          active={preset === "assigned"}
          href="/visitors?preset=assigned"
          label={`Assigned (${assignedCount})`}
        />
        <PresetButton
          active={preset === "contacted"}
          href="/visitors?preset=contacted"
          label={`Contacted (${contactedCount})`}
        />
        <PresetButton
          active={preset === "needs-attention"}
          href="/visitors?preset=needs-attention"
          label={`Needs Attention (${needsAttentionCount})`}
          disabled={!myAssignee}
        />
        {(preset === "my-needs-attention" || preset === "assigned-to-me") && myAssignee ? (
          <PresetScopeChip myAssignee={myAssignee} />
        ) : null}
        {preset !== "all" ? <ClearPresetLink /> : null}
      </div>

      {preset === "my-needs-attention" && myAssignee ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {myNeedsAttentionCount} visitors that need attention for {myAssignee}.
        </div>
      ) : preset === "waiting-assignment" ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {waitingAssignmentCount} visitors waiting for assignment.
        </div>
      ) : preset === "assigned-to-me" && myAssignee ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {assignedToMeCount} visitors assigned to {myAssignee}.
        </div>
      ) : preset === "assigned" ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {assignedCount} assigned visitors.
        </div>
      ) : preset === "contacted" ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {contactedCount} contacted visitors.
        </div>
      ) : preset === "needs-attention" ? (
        <div style={{ fontSize: 13, color: "#4b5563", fontWeight: 600 }}>
          Showing {needsAttentionCount} visitors that need attention.
        </div>
      ) : null}

      {actionError ? (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b"
          }}
        >
          {actionError}
        </div>
      ) : null}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Name</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Email</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Followup State</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Attention</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned To</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor ID</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Activity</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb", width: 320 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => {
              const rowStyle =
                item.attentionState === "Needs attention"
                  ? { background: "#fffbeb", boxShadow: "inset 4px 0 0 #f59e0b" }
                  : undefined;

              const canAssignToMe =
                item.followupState === "Waiting assignment" &&
                !!myAssignee;

              const canMarkContacted =
                item.followupState === "Assigned" &&
                !!myAssignee &&
                item.assignedTo === myAssignee;

              const canSetOutcome =
                item.followupState === "Contacted";

              const isEditingOutcome =
                editingOutcomeVisitorId === item.visitorId;

              return (
                <tr key={item.visitorId} style={rowStyle}>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    <Link
                      href={preset === "all" ? `/visitors/${item.visitorId}` : `/visitors/${item.visitorId}?preset=${preset}`}
                      style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}
                    >
                      {item.name}
                    </Link>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>{item.email ?? "-"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    <FollowupStateBadge state={item.followupState} />
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    <AttentionBadge state={item.attentionState} />
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    {item.assignedTo ? (
                      <Link
                        href={item.assignedTo === myAssignee ? "/visitors?preset=assigned-to-me" : "/visitors?preset=assigned"}
                        style={{
                          color: "#2563eb",
                          textDecoration: "none",
                          fontWeight: 600
                        }}
                      >
                        {item.assignedTo}
                      </Link>
                    ) : (
                      <span>-</span>
                    )}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace" }}>{item.visitorId}</span>
                      <CopyButton value={item.visitorId} label="Copy" />
                    </div>
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top" }}
                    title={formatAbsoluteTime(item.updatedAt)}
                  >
                    {formatRelativeTime(item.updatedAt)}
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", verticalAlign: "top", textAlign: "left" }}>
                    {canAssignToMe ? (
                      <button
                        type="button"
                        onClick={() => assignToMe(item.visitorId)}
                        disabled={assigningVisitorId === item.visitorId || contactingVisitorId === item.visitorId || savingOutcomeVisitorId === item.visitorId}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #111827",
                          background: "#111827",
                          color: "#fff",
                          font: "inherit",
                          cursor: assigningVisitorId === item.visitorId ? "default" : "pointer",
                          opacity: assigningVisitorId === item.visitorId ? 0.7 : 1,
                          whiteSpace: "nowrap"
                        }}
                      >
                        {assigningVisitorId === item.visitorId ? "Assigning..." : "Assign to me"}
                      </button>
                    ) : canMarkContacted ? (
                      <button
                        type="button"
                        onClick={() => markContacted(item.visitorId)}
                        disabled={contactingVisitorId === item.visitorId || assigningVisitorId === item.visitorId || savingOutcomeVisitorId === item.visitorId}
                        style={{
                          padding: "8px 12px",
                          borderRadius: 8,
                          border: "1px solid #111827",
                          background: "#111827",
                          color: "#fff",
                          font: "inherit",
                          cursor: contactingVisitorId === item.visitorId ? "default" : "pointer",
                          opacity: contactingVisitorId === item.visitorId ? 0.7 : 1,
                          whiteSpace: "nowrap"
                        }}
                      >
                        {contactingVisitorId === item.visitorId ? "Marking..." : "Mark contacted"}
                      </button>
                    ) : canSetOutcome ? (
                      isEditingOutcome ? (
                        <div style={{ display: "grid", gap: 8, width: "100%", maxWidth: 280, justifyItems: "start" }}>
                          <select
                            value={draftOutcome}
                            onChange={(event) => setDraftOutcome(event.target.value)}
                            disabled={savingOutcomeVisitorId === item.visitorId}
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              color: "#111827",
                              font: "inherit"
                            }}
                          >
                            {OUTCOME_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <textarea
                            value={draftNote}
                            onChange={(event) => setDraftNote(event.target.value)}
                            disabled={savingOutcomeVisitorId === item.visitorId}
                            rows={3}
                            placeholder="Optional operator note"
                            style={{
                              padding: "8px 10px",
                              borderRadius: 8,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                              color: "#111827",
                              font: "inherit",
                              resize: "vertical"
                            }}
                          />
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              onClick={() => saveOutcome(item.visitorId)}
                              disabled={savingOutcomeVisitorId === item.visitorId}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "1px solid #111827",
                                background: "#111827",
                                color: "#fff",
                                font: "inherit",
                                cursor: savingOutcomeVisitorId === item.visitorId ? "default" : "pointer",
                                opacity: savingOutcomeVisitorId === item.visitorId ? 0.7 : 1
                              }}
                            >
                              {savingOutcomeVisitorId === item.visitorId ? "Saving..." : "Save outcome"}
                            </button>
                            <button
                              type="button"
                              onClick={cancelOutcomeEditor}
                              disabled={savingOutcomeVisitorId === item.visitorId}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "1px solid #d1d5db",
                                background: "#fff",
                                color: "#111827",
                                font: "inherit",
                                cursor: savingOutcomeVisitorId === item.visitorId ? "default" : "pointer"
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startOutcomeEditor(item.visitorId)}
                          disabled={assigningVisitorId === item.visitorId || contactingVisitorId === item.visitorId || savingOutcomeVisitorId === item.visitorId}
                          style={{
                            padding: "8px 12px",
                            borderRadius: 8,
                            border: "1px solid #111827",
                            background: "#111827",
                            color: "#fff",
                            font: "inherit",
                            cursor: "pointer",
                            whiteSpace: "nowrap"
                          }}
                        >
                          Set outcome
                        </button>
                      )
                    ) : (
                      <span style={{ color: "#9ca3af" }}>-</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

