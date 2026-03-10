import Link from "next/link";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/copy-button";
import { StageBadge } from "@/components/stage-badge";
import { getVisitorDetail } from "@/lib/loaders/get-visitor-detail";
import { formatAbsoluteTime, formatRelativeTime } from "@/lib/format-relative-time";

function TimestampValue({ value }: { value: string | null }) {
  if (!value) {
    return <span>-</span>;
  }

  return (
    <div>
      <div style={{ fontWeight: 600 }}>{formatRelativeTime(value)}</div>
      <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
        {formatAbsoluteTime(value)}
      </div>
    </div>
  );
}

function DetailCard({
  title,
  children
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>{title}</h2>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
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
          Visitor detail aligned to the existing visitor and formation profile surfaces.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 }}>
        <DetailCard title="Visitor">
          <DetailRow
            label="Visitor ID"
            value={
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: "monospace" }}>{data.visitor.visitorId}</span>
                <CopyButton value={data.visitor.visitorId} label="Copy" />
              </div>
            }
          />
          <DetailRow label="Name" value={data.visitor.name} />
          <DetailRow label="Email" value={data.visitor.email ?? "-"} />
          <DetailRow label="Created" value={<TimestampValue value={data.visitor.createdAt} />} />
          <DetailRow label="Updated" value={<TimestampValue value={data.visitor.updatedAt} />} />
        </DetailCard>

        <DetailCard title="Formation Profile">
          {data.formationProfile ? (
            <>
              <DetailRow label="Partition Key" value={data.formationProfile.partitionKey} />
              <DetailRow label="Row Key" value={<span style={{ fontFamily: "monospace" }}>{data.formationProfile.rowKey}</span>} />
              <DetailRow label="Stage" value={<StageBadge stage={data.formationProfile.stage} />} />
              <DetailRow label="Last Event Type" value={data.formationProfile.lastEventType ?? "-"} />
              <DetailRow label="Last Event At" value={<TimestampValue value={data.formationProfile.lastEventAt} />} />
              <DetailRow label="Profile Updated" value={<TimestampValue value={data.formationProfile.updatedAt} />} />
            </>
          ) : (
            <p style={{ margin: 0, color: "#4b5563" }}>No formation profile yet.</p>
          )}
        </DetailCard>
      </div>
    </section>
  );
}
