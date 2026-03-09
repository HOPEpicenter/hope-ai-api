import Link from "next/link";
import { ReactNode } from "react";

const nav = [
  { href: "/overview", label: "Overview" },
  { href: "/followups", label: "Followups" },
  { href: "/visitors", label: "Visitors" },
  { href: "/timeline", label: "Timeline" }
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: "#f5f7fb", color: "#111827" }}>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", minHeight: "100vh" }}>
        <aside
          style={{
            borderRight: "1px solid #e5e7eb",
            background: "#ffffff",
            padding: 20,
            display: "grid",
            gridTemplateRows: "auto 1fr auto",
            gap: 24
          }}
        >
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: "#6b7280", textTransform: "uppercase" }}>
              HOPE
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 6 }}>Dashboard</div>
            <div style={{ fontSize: 14, color: "#6b7280", marginTop: 8 }}>
              Operator workspace for followups, visitors, and snapshots.
            </div>
          </div>

          <nav style={{ display: "grid", gap: 8, alignContent: "start" }}>
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  textDecoration: "none",
                  color: "#1f2937",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #e5e7eb",
                  background: "#fff",
                  fontWeight: 600
                }}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div
            style={{
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#f9fafb",
              padding: 12,
              fontSize: 13,
              color: "#4b5563"
            }}
          >
            Mock-first shell is complete.
            <br />
            Real data is now wired for overview, followups, visitors, and visitor detail.
          </div>
        </aside>

        <div style={{ display: "grid", gridTemplateRows: "auto 1fr" }}>
          <header
            style={{
              borderBottom: "1px solid #e5e7eb",
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(8px)"
            }}
          >
            <div style={{ maxWidth: 1280, margin: "0 auto", padding: "18px 24px" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>HOPE Dashboard</div>
              <div style={{ marginTop: 4, fontSize: 14, color: "#6b7280" }}>
                Focused operator views built on existing hardened backend surfaces.
              </div>
            </div>
          </header>

          <main>
            <div style={{ maxWidth: 1280, margin: "0 auto", padding: 24 }}>{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
