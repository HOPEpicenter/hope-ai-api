import { CreateVisitorForm } from "@/components/create-visitor-form";
import { VisitorsTable } from "@/components/visitors-table";
import { getVisitors } from "@/lib/loaders/get-visitors";

export default async function VisitorsPage() {
  const data = await getVisitors();

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Visitors</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Operator visitor directory aligned to the existing visitors list surface.
        </p>
      </div>

      <CreateVisitorForm />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Total Visitors</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>{data.items.length}</div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>With Email</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.items.filter((x) => !!x.email).length}
          </div>
        </div>
        <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
          <div style={{ fontSize: 12, color: "#6b7280" }}>Without Email</div>
          <div style={{ fontSize: 28, fontWeight: 700 }}>
            {data.items.filter((x) => !x.email).length}
          </div>
        </div>
      </div>

      <VisitorsTable items={data.items} />
    </section>
  );
}
