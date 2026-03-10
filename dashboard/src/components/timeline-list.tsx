import { PageState } from "@/components/page-state";
import type { TimelineItem } from "@/lib/contracts/timeline";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function StreamBadge({ stream }: { stream: TimelineItem["stream"] }) {
  const background = stream === "formation" ? "#dbeafe" : "#ede9fe";

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
      {stream}
    </span>
  );
}

export function TimelineList({ items }: { items: TimelineItem[] }) {
  if (items.length === 0) {
    return (
      <PageState
        title="No timeline events"
        message="Activity events will appear here as visitors interact with the system."
        actionHref="/overview"
        actionLabel="Back to overview"
      />
    );
  }

  const sortedItems = [...items].sort((a, b) => {
    const timeDiff = toTimestamp(b.occurredAt) - toTimestamp(a.occurredAt);
    if (timeDiff !== 0) return timeDiff;
    return a.eventId.localeCompare(b.eventId);
  });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {sortedItems.map((item) => (
        <div
          key={item.eventId}
          style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <StreamBadge stream={item.stream} />
              <strong>{item.type}</strong>
            </div>
            <div
              style={{ color: "#6b7280", fontSize: 14 }}
              title={formatAbsoluteTime(item.occurredAt)}
            >
              {formatRelativeTime(item.occurredAt)}
            </div>
          </div>

          <p style={{ marginBottom: 8, color: "#374151" }}>
            {item.summary ?? "No summary provided."}
          </p>

          <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
            {item.eventId}
          </div>
        </div>
      ))}
    </div>
  );
}
