import Link from "next/link";
import { getVisitorDetail } from "@/lib/loaders/get-visitor-detail";

function formatDate(value: string | null) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function DetailCard({
  title,
  children
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>{title}</h2>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 12, padding: "8px 0" }}>
      <div style={{ color: "#6b7280" }}>{label}</div>
      <div>{value}</div>
    </div>
  );
}

export default async function VisitorDetailPage(
  { params }: { params: Promise<{ visitorId: string }> }
) {
  const { visitorId } = await params;
  const data = await getVisitorDetail(visitorId);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        <Link href="/visitors" style={{ color: "#2563eb", textDecoration: "none" }}>
          ← Back to Visitors
        </Link>
        <h1 style={{ marginBottom: 8 }}>{data.visitor.name}</h1>
        <p style={{ marginTop: 0, color: "#4b5563" }}>
          Mock-first visitor detail page aligned to the existing visitor and formation profile surfaces.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        <DetailCard title="Visitor">
          <DetailRow label="Visitor ID" value={<span style={{ fontFamily: "monospace" }}>{data.visitor.visitorId}</span>} />
          <DetailRow label="Name" value={data.visitor.name} />
          <DetailRow label="Email" value={data.visitor.email ?? "-"} />
          <DetailRow label="Created" value={formatDate(data.visitor.createdAt)} />
          <DetailRow label="Updated" value={formatDate(data.visitor.updatedAt)} />
        </DetailCard>

        <DetailCard title="Formation Profile">
          {data.formationProfile ? (
            <>
              <DetailRow label="Partition Key" value={data.formationProfile.partitionKey} />
              <DetailRow label="Row Key" value={<span style={{ fontFamily: "monospace" }}>{data.formationProfile.rowKey}</span>} />
              <DetailRow label="Stage" value={data.formationProfile.stage ?? "-"} />
              <DetailRow label="Last Event Type" value={data.formationProfile.lastEventType ?? "-"} />
              <DetailRow label="Last Event At" value={formatDate(data.formationProfile.lastEventAt)} />
              <DetailRow label="Profile Updated" value={formatDate(data.formationProfile.updatedAt)} />
            </>
          ) : (
            <p style={{ margin: 0, color: "#4b5563" }}>No formation profile yet.</p>
          )}
        </DetailCard>
      </div>
    </section>
  );
}
