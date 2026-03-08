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
    <div style={{ minHeight: "100vh", background: "#fafafa", color: "#111" }}>
      <header style={{ borderBottom: "1px solid #e5e7eb", background: "#fff" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px" }}>
          <div style={{ fontWeight: 700, fontSize: 20 }}>HOPE Dashboard</div>
          <nav style={{ display: "flex", gap: 16, marginTop: 12 }}>
            {nav.map((item) => (
              <Link key={item.href} href={item.href} style={{ textDecoration: "none", color: "#2563eb" }}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        {children}
      </main>
    </div>
  );
}
