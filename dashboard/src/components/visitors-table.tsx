import Link from "next/link";
import type { VisitorListItem } from "@/lib/contracts/visitors";
import { PageState } from "@/components/page-state";
import { CopyButton } from "@/components/copy-button";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function VisitorsTable({ items }: { items: VisitorListItem[] }) {
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
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor ID</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Updated</th>
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
