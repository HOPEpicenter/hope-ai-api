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
        color: "#111827",
        textTransform: "capitalize"
      }}
    >
      {stream}
    </span>
  );
}

function EventTypeLabel({ type }: { type: string }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>
      {type}
    </div>
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
      {sortedItems.map((item) => {
        const accent = item.stream === "formation" ? "#93c5fd" : "#c4b5fd";

        return (
          <div
            key={item.eventId}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderLeft: `4px solid ${accent}`,
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 10
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ display: "grid", gap: 8 }}>
                <StreamBadge stream={item.stream} />
                <EventTypeLabel type={item.type} />
              </div>

              <div
                style={{ textAlign: "right", minWidth: 160 }}
                title={formatAbsoluteTime(item.occurredAt)}
              >
                <div style={{ color: "#374151", fontSize: 14, fontWeight: 600 }}>
                  {formatRelativeTime(item.occurredAt)}
                </div>
                <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                  {formatAbsoluteTime(item.occurredAt)}
                </div>
              </div>
            </div>

            <div style={{ color: "#374151", lineHeight: 1.5 }}>
              {item.summary ?? "No summary provided."}
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#6b7280" }}>Event ID</div>
              <div style={{ fontSize: 12, color: "#6b7280", fontFamily: "monospace" }}>
                {item.eventId}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
