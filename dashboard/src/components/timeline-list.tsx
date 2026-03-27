import { PageState } from "@/components/page-state";
import type { TimelineItem } from "@/lib/contracts/timeline";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function toTimestamp(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function EventTypeLabel({ type }: { type: string }) {
  return (
    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827", lineHeight: 1.3, overflowWrap: "anywhere", wordBreak: "break-word" }}>
      {type}
    </div>
  );
}

function formatEventType(type?: string): string {
  if (!type) return "Event";

  const map: Record<string, string> = {
    FOLLOWUP_ASSIGNED: "Follow-up assigned",
    FOLLOWUP_CONTACTED: "Follow-up contacted",
    FOLLOWUP_OUTCOME: "Follow-up outcome",
    "note.add": "Note added"
  };

  if (map[type]) return map[type];

  return type
    .replace(/[_\.]/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDayLabel(value: string | null | undefined): string {
  if (!value) return "Unknown date";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - target.getTime()) / 86400000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
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

  const groups = sortedItems.reduce((acc, item) => {
    const label = formatDayLabel(item.occurredAt);
    if (!acc[label]) acc[label] = [];
    acc[label].push(item);
    return acc;
  }, {} as Record<string, TimelineItem[]>);

  const orderedLabels = Object.keys(groups);

  return (
    <div style={{ display: "grid", gap: 18 }}>
      {orderedLabels.map((label) => (
        <div key={label} style={{ display: "grid", gap: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.4 }}>
            {label}
          </div>

          {groups[label].map((item) => {
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
                  gap: 12
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div style={{ display: "grid", gap: 8 }}>
                    <span
                      style={{
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 6,
                        background: item.stream === "formation" ? "#E0F2FE" : "#F0FDF4",
                        color: item.stream === "formation" ? "#0369A1" : "#166534",
                        fontWeight: 600,
                        width: "fit-content",
                        textTransform: "capitalize"
                      }}
                    >
                      {item.stream}
                    </span>
                    <EventTypeLabel type={formatEventType(item.type)} />
                  </div>

                  <div
                    style={{ textAlign: "right", minWidth: 160 }}
                    title={formatAbsoluteTime(item.occurredAt)}
                  >
                    <div style={{ color: "#374151", fontSize: 13, fontWeight: 500 }}>
                      {formatRelativeTime(item.occurredAt)}
                    </div>
                    <div style={{ color: "#6b7280", fontSize: 12, marginTop: 2 }}>
                      {formatAbsoluteTime(item.occurredAt)}
                    </div>
                  </div>
                </div>

                <div style={{ color: "#374151", lineHeight: 1.5, overflowWrap: "anywhere", wordBreak: "break-word", whiteSpace: "pre-wrap" }}>
                  {item.summary || "No details recorded"}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}



