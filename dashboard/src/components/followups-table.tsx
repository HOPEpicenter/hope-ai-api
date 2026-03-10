import type { CSSProperties } from "react";
import type { FollowupItem } from "@/lib/contracts/followups";
import { PageState } from "@/components/page-state";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function Badge({ needsFollowup }: { needsFollowup: boolean }) {
  const style: CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    background: needsFollowup ? "#fef3c7" : "#dcfce7",
    color: "#111827"
  };

  return <span style={style}>{needsFollowup ? "Needs followup" : "Up to date"}</span>;
}

export function FollowupsTable({ items }: { items: FollowupItem[] }) {
  if (items.length === 0) {
    return (
      <PageState
        title="No open followups"
        message="The queue is empty right now."
        actionHref="/overview"
        actionLabel="Back to overview"
      />
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned To</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Stage</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Status</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Assigned</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Last Contacted</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.visitorId}>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>
                {item.visitorId}
              </td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                {item.assignedTo?.ownerId ?? "-"}
              </td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                {item.stage ?? "-"}
              </td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                <Badge needsFollowup={item.needsFollowup} />
              </td>
              <td
                style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}
                title={formatAbsoluteTime(item.lastFollowupAssignedAt)}
              >
                {formatRelativeTime(item.lastFollowupAssignedAt)}
              </td>
              <td
                style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}
                title={formatAbsoluteTime(item.lastFollowupContactedAt)}
              >
                {formatRelativeTime(item.lastFollowupContactedAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
