export const dynamic = "force-dynamic";

import { TimelineList } from "@/components/timeline-list";
import { getTimeline } from "@/lib/loaders/get-timeline";

export default async function TimelinePage() {
  const data = await getTimeline();

  const formationCount = data.items.filter((x) => x.stream === "formation").length;
  const engagementCount = data.items.filter((x) => x.stream === "engagement").length;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Timeline</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Unified pastoral activity stream across formation and engagement.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.items.length}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Formation Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{formationCount}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Engagement Events</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{engagementCount}</div>
        </div>
      </div>

      <TimelineList items={data.items} />
    </section>
  );
}
