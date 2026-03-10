import type { CSSProperties } from "react";
import type { TimelineItem } from "@/lib/contracts/timeline";
import { PageState } from "@/components/page-state";

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function StreamBadge({ stream }: { stream: TimelineItem["stream"] }) {
  const style: CSSProperties = {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 600,
    background: stream === "formation" ? "#dbeafe" : "#ede9fe",
    color: "#111827"
  };

  return <span style={style}>{stream}</span>;
}

export function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <PageState
        title="No timeline events"
        message="Events will appear here once activity is recorded."
        actionHref="/overview"
        actionLabel="Back to overview"
      />
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {items.map((item) => (
        <div
          key={item.eventId}
          style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StreamBadge stream={item.stream} />
              <strong>{item.type}</strong>
            </div>
            <div style={{ color: "#6b7280", fontSize: 14 }}>{formatDate(item.occurredAt)}</div>
          </div>

          <p style={{ marginBottom: 8, color: "#374151" }}>{item.summary ?? "No summary provided."}</p>

          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
            {item.eventId}
          </div>
        </div>
      ))}
    </div>
  );
}
