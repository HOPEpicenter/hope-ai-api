import Link from "next/link";
import { getOverview } from "@/lib/loaders/get-overview";

export default async function OverviewPage() {
  const data = await getOverview();

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <h1 style={{ marginBottom: 8 }}>Overview</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Mock-first dashboard summary built from the existing hardened dashboard surfaces.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        {data.stats.map((stat) => (
          <div
            key={stat.label}
            style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}
          >
            <div style={{ fontSize: 12, color: "#6b7280" }}>{stat.label}</div>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{stat.value}</div>
            <div style={{ marginTop: 6, fontSize: 13, color: "#4b5563" }}>{stat.helper}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
        <h2 style={{ marginTop: 0, marginBottom: 12 }}>Jump back in</h2>
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
      </div>
    </section>
  );
}
