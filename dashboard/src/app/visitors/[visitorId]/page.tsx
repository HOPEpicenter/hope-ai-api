import Link from "next/link";
import type { ReactNode } from "react";
import { AssignFollowupForm } from "@/components/assign-followup-form";
import { FollowupOutcomeForm } from "@/components/followup-outcome-form";
import { MarkContactedForm } from "@/components/mark-contacted-form";
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

function formatOutcomeLabel(value: string | null | undefined) {
  if (!value) {
    return "-";
  }

  switch (value.trim().toUpperCase()) {
    case "CONNECTED":
      return "Connected";
    case "LEFT_VOICEMAIL":
      return "Left voicemail";
    case "NO_ANSWER":
      return "No answer";
    case "NOT_INTERESTED":
      return "Not interested";
    case "FOLLOW_UP_LATER":
      return "Follow up later";
    default:
      return value;
  }
}

function OutcomeSummaryCard({
  outcome,
  outcomeAt,
  outcomeNotes
}: {
  outcome: string | null | undefined;
  outcomeAt: string | null | undefined;
  outcomeNotes: string | null | undefined;
}) {
  if (!outcomeAt) {
    return (
      <div
        style={{
          background: "#f9fafb",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 16,
          display: "grid",
          gap: 6
        }}
      >
        <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Latest outcome</div>
        <div style={{ color: "#6b7280" }}>No outcome recorded yet.</div>
      </div>
    );
  }

  return (
    <div
      style={{
        background: "#ecfdf5",
        border: "1px solid #a7f3d0",
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 10
      }}
    >
      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#065f46" }}>Latest outcome</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: "#111827" }}>{formatOutcomeLabel(outcome)}</div>
      </div>

      <div style={{ display: "grid", gap: 2 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>Recorded</div>
        <div style={{ color: "#111827", fontWeight: 600 }}>{formatRelativeTime(outcomeAt)}</div>
        <div style={{ fontSize: 12, color: "#4b5563" }}>{formatAbsoluteTime(outcomeAt)}</div>
      </div>

      {outcomeNotes ? (
        <div
          style={{
            background: "#fff",
            border: "1px solid #d1fae5",
            borderRadius: 10,
            padding: 12,
            display: "grid",
            gap: 6
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: "#065f46" }}>Operator note</div>
          <div style={{ color: "#111827", whiteSpace: "pre-wrap" }}>{outcomeNotes}</div>
        </div>
      ) : null}
    </div>
  );
}

function FollowupTimelineCard({
  assignedAt,
  contactedAt,
  outcomeAt,
  outcome
}: {
  assignedAt: string | null | undefined;
  contactedAt: string | null | undefined;
  outcomeAt: string | null | undefined;
  outcome: string | null | undefined;
}) {
  const steps = [
    {
      label: "Assigned",
      value: assignedAt ?? null,
      detail: assignedAt ? "Followup was assigned to an operator." : "Not assigned yet."
    },
    {
      label: "Contacted",
      value: contactedAt ?? null,
      detail: contactedAt ? "Contact with the visitor was recorded." : "No contact recorded yet."
    },
    {
      label: "Outcome recorded",
      value: outcomeAt ?? null,
      detail: outcomeAt ? formatOutcomeLabel(outcome) : "No outcome recorded yet."
    }
  ];

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        display: "grid",
        gap: 14
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Followup Timeline</h2>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Read-only sequence of the current followup lifecycle for this visitor.
        </div>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        {steps.map((step, index) => {
          const completed = !!step.value;
          const isLast = index === steps.length - 1;

          return (
            <div
              key={step.label}
              style={{
                display: "grid",
                gridTemplateColumns: "20px 1fr",
                gap: 12,
                alignItems: "start"
              }}
            >
              <div style={{ display: "grid", justifyItems: "center", gap: 4 }}>
                <span
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 999,
                    background: completed ? "#10b981" : "#d1d5db",
                    marginTop: 4
                  }}
                />
                {!isLast ? (
                  <span
                    aria-hidden="true"
                    style={{
                      width: 2,
                      minHeight: 36,
                      background: completed ? "#a7f3d0" : "#e5e7eb"
                    }}
                  />
                ) : null}
              </div>

              <div
                style={{
                  display: "grid",
                  gap: 4,
                  paddingBottom: isLast ? 0 : 4
                }}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, color: "#111827" }}>{step.label}</span>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 9999,
                      background: completed ? "#ecfdf5" : "#f3f4f6",
                      color: completed ? "#065f46" : "#4b5563",
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {completed ? "Done" : "Pending"}
                  </span>
                </div>

                <div style={{ color: "#4b5563" }}>{step.detail}</div>

                {step.value ? (
                  <div style={{ display: "grid", gap: 2 }}>
                    <div style={{ fontWeight: 600, color: "#111827" }}>{formatRelativeTime(step.value)}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>{formatAbsoluteTime(step.value)}</div>
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function VisitorDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ visitorId: string }>;
  searchParams: Promise<{ created?: string; existing?: string; assigned?: string; assigneeId?: string; contacted?: string; outcomeRecorded?: string }>;
}) {
  const { visitorId } = await params;
  const { created, existing, assigned, assigneeId, contacted, outcomeRecorded } = await searchParams;
  const data = await getVisitorDetail(visitorId);
  const followupStatus = getFollowupStatus(data.formationProfile);

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

      {contacted === "1" ? (
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
          Followup contact recorded.
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

      <OutcomeSummaryCard
        outcome={data.formationProfile?.lastFollowupOutcome}
        outcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
        outcomeNotes={data.formationProfile?.lastFollowupOutcomeNotes}
      />

      <FollowupTimelineCard
        assignedAt={data.formationProfile?.lastFollowupAssignedAt ?? null}
        contactedAt={data.formationProfile?.lastFollowupContactedAt ?? null}
        outcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
        outcome={data.formationProfile?.lastFollowupOutcome ?? null}
      />

      <AssignFollowupForm visitorId={data.visitor.visitorId} assignedToOwnerId={data.formationProfile?.assignedTo?.ownerId ?? null} />
      <MarkContactedForm
        visitorId={data.visitor.visitorId}
        lastFollowupContactedAt={data.formationProfile?.lastFollowupContactedAt ?? null}
        lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
      />
      <FollowupOutcomeForm
        visitorId={data.visitor.visitorId}
        lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
      />

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
              <DetailRow
                label="Status"
                value={
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: 9999,
                      background: followupStatus === "Resolved" ? "#dcfce7" : followupStatus === "Contacted" ? "#dbeafe" : followupStatus === "Assigned" ? "#fef3c7" : "#f3f4f6",
                      color: "#111827",
                      fontSize: 12,
                      fontWeight: 700
                    }}
                  >
                    {followupStatus}
                  </span>
                }
              />
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
                value={formatOutcomeLabel(data.formationProfile.lastFollowupOutcome)}
              />
              <DetailRow
                label="Outcome Notes"
                value={
                  data.formationProfile.lastFollowupOutcomeNotes ? (
                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 12,
                        whiteSpace: "pre-wrap"
                      }}
                    >
                      {data.formationProfile.lastFollowupOutcomeNotes}
                    </div>
                  ) : (
                    "-"
                  )
                }
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
