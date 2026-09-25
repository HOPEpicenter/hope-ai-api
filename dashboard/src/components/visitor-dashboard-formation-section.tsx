import type { CSSProperties } from "react";

type FormationPathway = {
  pathwayId: string;
  pathwayType: string | null;
  currentStepId: string | null;
  status: "in_progress" | "stalled" | "completed";
};

type FormationProfile = {
  activePathway: FormationPathway | null;
  history: FormationPathway[];
};

type FormationTimelineItem = {
  occurredAt: string;
  type: string;
  pathwayId: string;
  stepId?: string;
  notes?: string;
  reason?: string;
  statusChange?: string;
};

type FormationMilestones = {
  totalStepsCompleted: number;
  totalStalls: number;
  totalPathwaysCompleted: number;
  fastestStepCompletion: { stepId?: string; durationDays: number } | null;
  longestStepCompletion: { stepId?: string; durationDays: number } | null;
};

type FormationCoaching = {
  encouragement: string[];
  concerns: string[];
  recommendedNextStep: string | null;
  formationSummary: string;
  coachingPriority: "low" | "medium" | "high";
};

type VisitorDashboardFormationSectionProps = {
  formationProfile: FormationProfile;
  formationTimeline: readonly FormationTimelineItem[];
  formationMilestones: FormationMilestones;
  formationCoaching: FormationCoaching;
};

const cardStyle: CSSProperties = {
  border: "1px solid #d9e2ec",
  borderRadius: 8,
  background: "#ffffff",
  padding: 16,
  display: "grid",
  gap: 16
};

const labelStyle: CSSProperties = {
  color: "#334e68",
  fontSize: 12,
  fontWeight: 700,
  margin: 0
};

const mutedStyle: CSSProperties = {
  color: "#52606d",
  fontSize: 13,
  margin: "4px 0 0"
};

function formatTimestamp(value: string): string {
  return new Date(value).toLocaleString();
}

function priorityStyle(priority: FormationCoaching["coachingPriority"]): CSSProperties {
  const colors = {
    low: { background: "#e6fffa", color: "#0f766e" },
    medium: { background: "#fff7ed", color: "#9a3412" },
    high: { background: "#fef2f2", color: "#b91c1c" }
  };

  return {
    ...colors[priority],
    borderRadius: 4,
    display: "inline-block",
    fontSize: 12,
    fontWeight: 700,
    padding: "3px 6px",
    textTransform: "capitalize"
  };
}

export function VisitorDashboardFormationSection({
  formationProfile,
  formationTimeline,
  formationMilestones,
  formationCoaching
}: VisitorDashboardFormationSectionProps) {
  const activePathway = formationProfile.activePathway;
  const recentEvents = formationTimeline.slice(-5);

  return (
    <section aria-labelledby="visitor-formation-heading" style={cardStyle}>
      <div>
        <h2 id="visitor-formation-heading" style={{ color: "#102a43", fontSize: 18, margin: 0 }}>
          Formation
        </h2>
      </div>

      <div>
        <p style={labelStyle}>Current pathway</p>
        {activePathway ? (
          <>
            <p style={{ fontWeight: 700, margin: "4px 0 0" }}>
              {activePathway.pathwayType ?? activePathway.pathwayId}
            </p>
            <p style={mutedStyle}>
              {activePathway.status.replace("_", " ")} | Current step: {activePathway.currentStepId ?? "Not assigned"}
            </p>
          </>
        ) : (
          <p style={mutedStyle}>No active formation pathway.</p>
        )}
      </div>

      <div>
        <p style={labelStyle}>Recent events</p>
        {recentEvents.length === 0 ? (
          <p style={mutedStyle}>No formation events recorded.</p>
        ) : (
          <ol style={{ display: "grid", gap: 8, margin: "8px 0 0", paddingLeft: 20 }}>
            {recentEvents.map((event) => (
              <li key={`${event.pathwayId}-${event.occurredAt}-${event.type}`} style={{ color: "#243b53", fontSize: 13 }}>
                <strong>{event.type}</strong>
                {event.stepId ? `: ${event.stepId}` : ""}
                <span style={{ color: "#627d98" }}> | {formatTimestamp(event.occurredAt)}</span>
                {event.notes ? <div style={mutedStyle}>{event.notes}</div> : null}
                {event.reason ? <div style={mutedStyle}>{event.reason}</div> : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div>
        <p style={labelStyle}>Key milestones</p>
        <p style={mutedStyle}>
          {formationMilestones.totalStepsCompleted} steps completed | {formationMilestones.totalStalls} stalls | {formationMilestones.totalPathwaysCompleted} pathways completed
        </p>
        {formationMilestones.fastestStepCompletion ? (
          <p style={mutedStyle}>
            Fastest step: {formationMilestones.fastestStepCompletion.stepId ?? "Step"} in {formationMilestones.fastestStepCompletion.durationDays} day(s)
          </p>
        ) : null}
        {formationMilestones.longestStepCompletion ? (
          <p style={mutedStyle}>
            Longest step: {formationMilestones.longestStepCompletion.stepId ?? "Step"} in {formationMilestones.longestStepCompletion.durationDays} day(s)
          </p>
        ) : null}
      </div>

      <div>
        <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
          <p style={labelStyle}>Coaching</p>
          <span style={priorityStyle(formationCoaching.coachingPriority)}>
            {formationCoaching.coachingPriority}
          </span>
        </div>
        <p style={mutedStyle}>{formationCoaching.formationSummary}</p>
        {formationCoaching.recommendedNextStep ? (
          <p style={{ color: "#102a43", fontSize: 13, fontWeight: 700, margin: "8px 0 0" }}>
            {formationCoaching.recommendedNextStep}
          </p>
        ) : null}
        {formationCoaching.encouragement.map((message) => (
          <p key={message} style={{ color: "#0f766e", fontSize: 13, margin: "8px 0 0" }}>
            {message}
          </p>
        ))}
        {formationCoaching.concerns.map((message) => (
          <p key={message} style={{ color: "#b91c1c", fontSize: 13, margin: "8px 0 0" }}>
            {message}
          </p>
        ))}
      </div>
    </section>
  );
}