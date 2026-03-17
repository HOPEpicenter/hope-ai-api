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

export function VisitorsTable({ items }: { items: VisitorsTableItem[] }) {
  if (items.length === 0) {
    return (
      <PageState
        title="No visitors yet"
        message="Visitor records will appear here once someone interacts with the system."
        actionHref="/overview"
        actionLabel="Back to overview"
      />
    );
  }

  const sortedItems = [...items].sort((a, b) => {
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
  );
}
