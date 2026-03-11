import Link from "next/link";
import type { ReactNode } from "react";
import { AssignFollowupForm } from "@/components/assign-followup-form";
import { FollowupOutcomeForm } from "@/components/followup-outcome-form";
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
      <div style={{ fontWeight: 600, color: "#111827" }}>{formatRelativeTime(value)}</div>
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
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        display: "grid",
        gap: 4
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18, color: "#111827" }}>{title}</h2>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "160px 1fr",
        gap: 12,
        padding: "10px 0",
        borderTop: "1px solid #f3f4f6"
      }}
    >
      <div style={{ color: "#6b7280", fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ color: "#111827", minWidth: 0 }}>{value}</div>
    </div>
  );
}

function getFollowupStatus(profile: {
  lastFollowupAssignedAt?: string | null;
  lastFollowupContactedAt?: string | null;
  lastFollowupOutcomeAt?: string | null;
} | null): string {
  if (!profile) {
    return "No active followup";
  }

  if (profile.lastFollowupOutcomeAt) {
    return "Resolved";
  }

  if (profile.lastFollowupContactedAt) {
    return "Contacted";
  }

  if (profile.lastFollowupAssignedAt) {
    return "Assigned";
  }

  return "No active followup";
}

export default async function VisitorDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ visitorId: string }>;
  searchParams: Promise<{ created?: string; existing?: string; assigned?: string; assigneeId?: string; outcomeRecorded?: string }>;
}) {
  const { visitorId } = await params;
  const { created, existing, assigned, assigneeId, outcomeRecorded } = await searchParams;
  const data = await getVisitorDetail(visitorId);

  return (
    <section style={{ display: "grid", gap: 16 }}>
      {created === "1" ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: 12,
            padding: 12,
            fontWeight: 600
          }}
        >
          Visitor created successfully.
        </div>
      ) : null}

      {existing === "1" ? (
        <div
          style={{
            background: "#eff6ff",
            border: "1px solid #bfdbfe",
            color: "#1d4ed8",
            borderRadius: 12,
            padding: 12,
            fontWeight: 600
          }}
        >
          Visitor already existed. Opened existing record.
        </div>
      ) : null}

      {assigned === "1" ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: 12,
            padding: 12,
            fontWeight: 600
          }}
        >
          Followup assigned{assigneeId ? ` to ${assigneeId}` : ""}.
        </div>
      ) : null}

      {outcomeRecorded === "1" ? (
        <div
          style={{
            background: "#ecfdf5",
            border: "1px solid #a7f3d0",
            color: "#065f46",
            borderRadius: 12,
            padding: 12,
            fontWeight: 600
          }}
        >
          Followup outcome recorded successfully.
        </div>
      ) : null}

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 20
        }}
      >
        <Link href="/visitors" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
          ← Back to Visitors
        </Link>

        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          <h1 style={{ margin: 0, color: "#111827" }}>{data.visitor.name}</h1>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Visitor detail aligned to the existing visitor and formation profile surfaces.
          </div>
        </div>
      </div>

      <AssignFollowupForm visitorId={data.visitor.visitorId} />
      <FollowupOutcomeForm visitorId={data.visitor.visitorId} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
        <DetailCard title="Visitor">
          <DetailRow
            label="Visitor ID"
            value={
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
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
              <DetailRow
                label="Row Key"
                value={<span style={{ fontFamily: "monospace" }}>{data.formationProfile.rowKey}</span>}
              />
              <DetailRow label="Stage" value={<StageBadge stage={data.formationProfile.stage} />} />
              <DetailRow label="Last Event Type" value={data.formationProfile.lastEventType ?? "-"} />
              <DetailRow label="Last Event At" value={<TimestampValue value={data.formationProfile.lastEventAt} />} />
              <DetailRow label="Profile Updated" value={<TimestampValue value={data.formationProfile.updatedAt} />} />
            </>
          ) : (
            <p style={{ margin: 0, color: "#4b5563" }}>No formation profile yet.</p>
          )}
        </DetailCard>

        <DetailCard title="Followup Status">
          {data.formationProfile ? (
            <>
              <DetailRow label="Status" value={getFollowupStatus(data.formationProfile)} />
              <DetailRow
                label="Assigned To"
                value={data.formationProfile.assignedTo?.ownerId ?? "-"}
              />
              <DetailRow
                label="Assigned At"
                value={<TimestampValue value={data.formationProfile.lastFollowupAssignedAt ?? null} />}
              />
              <DetailRow
                label="Contacted At"
                value={<TimestampValue value={data.formationProfile.lastFollowupContactedAt ?? null} />}
              />
              <DetailRow
                label="Outcome At"
                value={<TimestampValue value={data.formationProfile.lastFollowupOutcomeAt ?? null} />}
              />
              <DetailRow
                label="Outcome"
                value={data.formationProfile.lastFollowupOutcome ?? "-"}
              />
              <DetailRow
                label="Outcome Notes"
                value={data.formationProfile.lastFollowupOutcomeNotes ?? "-"}
              />
            </>
          ) : (
            <p style={{ margin: 0, color: "#4b5563" }}>No followup activity yet.</p>
          )}
        </DetailCard>
      </div>
    </section>
  );
}

