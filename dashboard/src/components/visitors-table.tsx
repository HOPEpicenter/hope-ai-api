import Link from "next/link";
import type { VisitorListItem } from "@/lib/contracts/visitors";

function formatDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export function VisitorsTable({ items }: { items: VisitorListItem[] }) {
  if (items.length === 0) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 24 }}>
        <h2 style={{ marginTop: 0 }}>No visitors yet</h2>
        <p style={{ marginBottom: 0, color: "#4b5563" }}>Visitor records will appear here.</p>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Name</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Email</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Visitor ID</th>
            <th style={{ textAlign: "left", padding: 12, borderBottom: "1px solid #e5e7eb" }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.visitorId}>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>
                <Link href={`/visitors/${item.visitorId}`} style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
                  {item.name}
                </Link>
              </td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{item.email ?? "-"}</td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb", fontFamily: "monospace" }}>{item.visitorId}</td>
              <td style={{ padding: 12, borderBottom: "1px solid #e5e7eb" }}>{formatDate(item.updatedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
