import Link from "next/link";
import { CopyButton } from "@/components/copy-button";
import { PageState } from "@/components/page-state";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";
import type { VisitorListItem } from "@/lib/contracts/visitors";

export type VisitorsTableItem = VisitorListItem & {
  followupState: "Assigned" | "Waiting assignment";
  assignedTo: string | null;
};

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function FollowupStateBadge({ state }: { state: VisitorsTableItem["followupState"] }) {
  const isAssigned = state === "Assigned";

  return (
    <span
      style={{
        display: "inline-block",
        padding: "4px 8px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 600,
        background: isAssigned ? "#dbeafe" : "#fef3c7",
        color: "#111827"
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
    if (a.assignedTo !== b.assignedTo) {
      return a.assignedTo ? 1 : -1;
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
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned To</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor ID</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Activity</th>
          </tr>
        </thead>
        <tbody>
          {sortedItems.map((item) => (
            <tr key={item.visitorId}>
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
                {item.assignedTo ?? "-"}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
