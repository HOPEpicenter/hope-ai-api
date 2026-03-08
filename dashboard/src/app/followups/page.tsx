import { FollowupsTable } from "@/components/followups-table";
import { getFollowups } from "@/lib/loaders/get-followups";

export default async function FollowupsPage() {
  const data = await getFollowups();

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Followups</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Mock-first operator queue for assigned followups that still need attention.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Open Items</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.items.length}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Need Followup</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.items.filter((x) => x.needsFollowup).length}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Up To Date</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.items.filter((x) => !x.needsFollowup).length}
          </div>
        </div>
      </div>

      <FollowupsTable items={data.items} />
    </section>
  );
}
