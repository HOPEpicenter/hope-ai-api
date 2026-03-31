import Link from "next/link";
import { getOverview } from "@/lib/loaders/get-overview";
import { FormationOverviewSection } from "@/components/formation-overview-section";

function getHref(label: string) {
  switch (label) {
    case "Waiting Assignment":
      return "/visitors?preset=waiting-assignment";
    case "Needs Attention":
      return "/visitors?preset=needs-attention";
    case "Contacted":
      return "/visitors?preset=contacted";
    case "Visitors":
      return "/visitors";
    default:
      return "/visitors";
  }
}

export default async function OverviewPage() {
  const data = await getOverview();

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Overview</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Operator triage summary built from the existing hardened visitors and followups surfaces.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {data.stats.map((stat) => (
          <Link
            key={stat.label}
            href={getHref(stat.label)}
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              textDecoration: "none",
              color: "inherit",
              display: "block"
            }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#4b5563" }}>{stat.helper}</div>
          </Link>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>Needs attention now</h2>
          <Link href="/visitors?preset=needs-attention" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            Open queue
          </Link>
        </div>

        {data.recent.length > 0 ? (
          <div style={{ display: "grid", gap: 12 }}>
            {data.recent.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  border: "1px solid #e5e7eb",
                  borderRadius: 10,
                  padding: 12
                }}
              >
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                <div style={{ marginTop: 4, color: "#4b5563" }}>{item.subtitle}</div>
              </Link>
            ))}
          </div>
        ) : (
          <div style={{ color: "#4b5563" }}>No assigned followups currently need attention.</div>
        )}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 style={{ marginTop: 0, marginBottom: 8 }}>Waiting assignment</h2>
            <p style={{ margin: 0, color: "#4b5563" }}>
              Start with visitors who still need an owner.
            </p>
          </div>
          <Link href="/visitors?preset=waiting-assignment" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            Open waiting assignment
          </Link>
        </div>
      </div>

      <FormationOverviewSection />
    </section>
  );
}
