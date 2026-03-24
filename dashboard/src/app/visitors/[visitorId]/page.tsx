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

function HeaderChip({
  label,
  value
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div
      style={{
        display: "grid",
        gap: 4,
        padding: "10px 12px",
        borderRadius: 10,
        background: "#f9fafb",
        border: "1px solid #e5e7eb",
        minWidth: 0
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280" }}>{label}</div>
      <div style={{ color: "#111827", fontWeight: 600, minWidth: 0 }}>{value}</div>
    </div>
  );
}

function getNextAction(
  followupStatus: string,
  assignedToOwnerId: string | null | undefined
) {
  if (followupStatus === "Resolved") {
    return {
      title: "No action needed",
      body: "This visitor already has a recorded followup outcome.",
      tone: "success" as const,
      actionKey: "none" as const
    };
  }

  if (followupStatus === "Contacted") {
    return {
      title: "Next action: record outcome",
      body: "Contact is already recorded. Add the outcome to close the loop clearly.",
      tone: "primary" as const,
      actionKey: "outcome" as const
    };
  }

  if (followupStatus === "Assigned" && assignedToOwnerId) {
    return {
      title: "Next action: mark contacted",
      body: "This followup is assigned and ready for outreach tracking.",
      tone: "primary" as const,
      actionKey: "contacted" as const
    };
  }

  return {
    title: "Next action: assign followup",
    body: "This visitor does not have an active assigned followup yet.",
    tone: "warning" as const,
    actionKey: "assign" as const
  };
}

function NextActionCard({
  title,
  body,
  tone
}: {
  title: string;
  body: string;
  tone: "primary" | "warning" | "success";
}) {
  const palette =
    tone === "success"
      ? {
          background: "#ecfdf5",
          border: "#a7f3d0",
          eyebrow: "#065f46"
        }
      : tone === "warning"
        ? {
            background: "#fffbeb",
            border: "#fde68a",
            eyebrow: "#92400e"
          }
        : {
            background: "#eff6ff",
            border: "#bfdbfe",
            eyebrow: "#1d4ed8"
          };

  return (
    <div
      style={{
        background: palette.background,
        border: `1px solid ${palette.border}`,
        borderRadius: 12,
        padding: 16,
        display: "grid",
        gap: 6
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          color: palette.eyebrow
        }}
      >
        Next step
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>{title}</div>
      <div style={{ color: "#4b5563" }}>{body}</div>
    </div>
  );
}

function VisitorHeaderCard({
  visitorId,
  name,
  email,
  stage,
  followupStatus
}: {
  visitorId: string;
  name: string;
  email: string | null;
  stage: string | null | undefined;
  followupStatus: string;
}) {
  const statusBackground =
    followupStatus === "Resolved"
      ? "#dcfce7"
      : followupStatus === "Contacted"
        ? "#dbeafe"
        : followupStatus === "Assigned"
          ? "#fef3c7"
          : "#f3f4f6";

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 20,
        display: "grid",
        gap: 16
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 8 }}>
          <Link href="/visitors" style={{ color: "#2563eb", textDecoration: "none", fontWeight: 600 }}>
            ← Back to Visitors
          </Link>

          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, color: "#111827" }}>{name}</h1>
              <span
                style={{
                  display: "inline-block",
                  padding: "4px 10px",
                  borderRadius: 9999,
                  background: statusBackground,
                  color: "#111827",
                  fontSize: 12,
                  fontWeight: 700
                }}
              >
                {followupStatus}
              </span>
            </div>

            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Visitor detail aligned to the existing visitor and formation profile surfaces.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
            padding: "8px 10px",
            borderRadius: 10,
            background: "#f9fafb",
            border: "1px solid #e5e7eb"
          }}
        >
          <span style={{ fontFamily: "monospace", color: "#111827" }}>{visitorId}</span>
          <CopyButton value={visitorId} label="Copy ID" />
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
          gap: 12
        }}
      >
        <HeaderChip label="Visitor ID" value={<span style={{ fontFamily: "monospace" }}>{visitorId}</span>} />
        <HeaderChip label="Email" value={email ?? "-"} />
        <HeaderChip label="Stage" value={<StageBadge stage={stage ?? null} />} />
        <HeaderChip label="Followup" value={followupStatus} />
      </div>
    </div>
  );
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

function formatEventLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown event";
  }

  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function EventTimelineCard({
  events
}: {
  events: Array<{
    eventId: string;
    eventType: string;
    happenedAt: string | null;
    source: string | null;
    notes: string | null;
  }>;
}) {
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
        <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Recent Formation Events</h2>
        <div style={{ fontSize: 14, color: "#6b7280" }}>
          Latest read-only event history for this visitor.
        </div>
      </div>

      {events.length === 0 ? (
        <div style={{ color: "#6b7280" }}>No formation events available.</div>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {events.map((event, index) => {
            const isLast = index === events.length - 1;

            return (
              <div
                key={event.eventId}
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
                      width: 10,
                      height: 10,
                      borderRadius: 999,
                      background: "#2563eb",
                      marginTop: 5
                    }}
                  />
                  {!isLast ? (
                    <span
                      aria-hidden="true"
                      style={{
                        width: 2,
                        minHeight: 36,
                        background: "#dbeafe"
                      }}
                    />
                  ) : null}
                </div>

                <div style={{ display: "grid", gap: 4 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 700, color: "#111827" }}>{formatEventLabel(event.eventType)}</span>
                    {event.source ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 9999,
                          background: "#f3f4f6",
                          color: "#4b5563",
                          fontSize: 12,
                          fontWeight: 700
                        }}
                      >
                        {event.source}
                      </span>
                    ) : null}
                  </div>

                  {event.happenedAt ? (
                    <div style={{ display: "grid", gap: 2 }}>
                      <div style={{ fontWeight: 600, color: "#111827" }}>{formatRelativeTime(event.happenedAt)}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{formatAbsoluteTime(event.happenedAt)}</div>
                    </div>
                  ) : (
                    <div style={{ color: "#6b7280" }}>No timestamp available.</div>
                  )}

                  {event.notes ? (
                    <div
                      style={{
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: 10,
                        color: "#111827",
                        whiteSpace: "pre-wrap"
                      }}
                    >
                      {event.notes}
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const nextAction = getNextAction(
    followupStatus,
    data.formationProfile?.assignedTo?.ownerId ?? null
  );

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

      <VisitorHeaderCard
        visitorId={data.visitor.visitorId}
        name={data.visitor.name}
        email={data.visitor.email}
        stage={data.formationProfile?.stage ?? null}
        followupStatus={followupStatus}
      />

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

      <EventTimelineCard events={data.formationEvents} />

      <div
        style={{
          background: "#fff",
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          padding: 20,
          display: "grid",
          gap: 16
        }}
      >
        <div style={{ display: "grid", gap: 4 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Actions</h2>
          <div style={{ fontSize: 14, color: "#6b7280" }}>
            Run followup actions for this visitor from one clear action zone.
          </div>
        </div>

        <div style={{ display: "grid", gap: 12 }}>
          <NextActionCard
            title={nextAction.title}
            body={nextAction.body}
            tone={nextAction.tone}
          />

          {nextAction.actionKey === "assign" ? (
            <AssignFollowupForm
              visitorId={data.visitor.visitorId}
              assignedToOwnerId={data.formationProfile?.assignedTo?.ownerId ?? null}
            />
          ) : null}

          {nextAction.actionKey === "contacted" ? (
            <MarkContactedForm
              visitorId={data.visitor.visitorId}
              lastFollowupContactedAt={data.formationProfile?.lastFollowupContactedAt ?? null}
              lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
            />
          ) : null}

          {nextAction.actionKey === "outcome" ? (
            <FollowupOutcomeForm
              visitorId={data.visitor.visitorId}
              lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
            />
          ) : null}

          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              padding: 16,
              display: "grid",
              gap: 12
            }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Other actions</div>
              <div style={{ fontSize: 13, color: "#6b7280" }}>
                Secondary actions stay available without competing with the primary next step.
              </div>
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              {nextAction.actionKey !== "assign" ? (
                <AssignFollowupForm
                  visitorId={data.visitor.visitorId}
                  assignedToOwnerId={data.formationProfile?.assignedTo?.ownerId ?? null}
                />
              ) : null}

              {nextAction.actionKey !== "contacted" ? (
                <MarkContactedForm
                  visitorId={data.visitor.visitorId}
                  lastFollowupContactedAt={data.formationProfile?.lastFollowupContactedAt ?? null}
                  lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
                />
              ) : null}

              {nextAction.actionKey !== "outcome" ? (
                <FollowupOutcomeForm
                  visitorId={data.visitor.visitorId}
                  lastFollowupOutcomeAt={data.formationProfile?.lastFollowupOutcomeAt ?? null}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

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

