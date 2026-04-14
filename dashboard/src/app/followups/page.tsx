import { FollowupsTableClient } from "@/components/followups-table-client";
import { getFollowups } from "@/lib/loaders/get-followups";

function SummaryCard({
  label,
  value,
  hint
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 6
      }}
    >
      <div style={{ fontSize: 12, color: "#6b7280" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{hint}</div>
    </div>
  );
}

function QueueLegendCard() {
  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Queue states</div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>
          Read-only guide for how the open followup queue is grouped.
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12
        }}
      >
        <div
          style={{
            border: "1px solid #fde68a",
            background: "#fffbeb",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontWeight: 700, color: "#92400e" }}>Action needed</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            Assigned followups that still need first outreach or operator action.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #bfdbfe",
            background: "#eff6ff",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontWeight: 700, color: "#1d4ed8" }}>Contact made</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            Contact was recorded, but the final followup outcome is still not recorded.
          </div>
        </div>

        <div
          style={{
            border: "1px solid #d1d5db",
            background: "#f9fafb",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontWeight: 700, color: "#374151" }}>Not shown in queue</div>
          <div style={{ fontSize: 13, color: "#4b5563" }}>
            Resolved followups are removed from this queue after an outcome is recorded.
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function FollowupsPage() {
  const data = await getFollowups();
  const actionNeededCount = data.items.filter((x) => x.needsFollowup).length;
  const contactMadeCount = data.items.filter((x) => !x.needsFollowup).length;

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Followups</h1>
        <p style={{ marginTop: 0, marginBottom: 6, color: "#4b5563" }}>
          Assigned visitors who still need follow-up attention.
        </p>
        <p style={{ marginTop: 0, color: "#6b7280", fontSize: 14 }}>
          Contact updates queue activity, but follow-up outcome is what resolves and removes an item.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <SummaryCard
          label="Open Items"
          value={data.items.length}
          hint="All currently open assigned followups still visible in this queue."
        />
        <SummaryCard
          label="Action Needed"
          value={actionNeededCount}
          hint="Assigned followups that still need outreach or first operator action."
        />
        <SummaryCard
          label="Contact Made"
          value={contactMadeCount}
          hint="Contact was recorded, but the final outcome is still not recorded."
        />
      </div>

      <QueueLegendCard />

      <FollowupsTableClient items={data.items} />
    </section>
  );
}
