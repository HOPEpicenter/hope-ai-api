import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { PageState } from "@/components/page-state";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";
import type { VisitorListItem } from "@/lib/contracts/visitors";

export type VisitorsTableItem = VisitorListItem & {
  followupState: "Assigned" | "Waiting assignment" | "Contacted";
  attentionState: "Needs attention" | "Contact made" | null;
  assignedTo: string | null;
};

type VisitorsPreset = "all" | "my-needs-attention" | "waiting-assignment" | "assigned-to-me" | "assigned" | "contacted";

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

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background,
        color
      }}
    >
      {state}
    </span>
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
  contactedCount
}: {
  items: VisitorsTableItem[];
  preset: VisitorsPreset;
  myAssignee: string;
  allCount: number;
  myNeedsAttentionCount: number;
  assignedToMeCount: number;
  assignedCount: number;
  contactedCount: number;
}) {
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
      ) : null}

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Name</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Email</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Followup State</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Attention</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned To</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor ID</th>
              <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item) => {
              const rowStyle =
                item.attentionState === "Needs attention"
                  ? { background: "#fffbeb", boxShadow: "inset 4px 0 0 #f59e0b" }
                  : undefined;

              const actionCellStyle =
                item.attentionState === "Needs attention"
                  ? {
                      background: "#fff7ed",
                      border: "1px solid #fed7aa",
                      borderRadius: 10,
                      padding: 10,
                      display: "grid" as const,
                      gap: 8
                    }
                  : {
                      display: "grid" as const,
                      gap: 8
                    };

              return (
                <tr key={item.visitorId} style={rowStyle}>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <Link href={`/visitors/${item.visitorId}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                      {item.name}
                    </Link>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.email ?? "-"}</td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <FollowupStateBadge state={item.followupState} />
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={actionCellStyle}>
                      <AttentionBadge state={item.attentionState} />
                    </div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={actionCellStyle}>
                      <span>{item.assignedTo ?? "-"}</span>
                    </div>
                  </td>
                  <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontFamily: "monospace" }}>{item.visitorId}</span>
                      <CopyButton value={item.visitorId} label="Copy" />
                    </div>
                  </td>
                  <td
                    style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}
                    title={formatAbsoluteTime(item.updatedAt)}
                  >
                    {formatRelativeTime(item.updatedAt)}
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




