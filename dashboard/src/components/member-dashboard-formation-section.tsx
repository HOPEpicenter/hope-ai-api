import { useEffect, useState, type CSSProperties } from "react";

type FormationStep = {
  stepId: string;
  completedAt?: string;
  stalledSince?: string;
  reason?: string;
};

type FormationPathway = {
  pathwayId: string;
  pathwayType: string | null;
  completedAt: string | null;
  currentStepId: string | null;
  status: "in_progress" | "stalled" | "completed";
  steps: FormationStep[];
};

type FormationProfile = {
  activePathway: FormationPathway | null;
  history: FormationPathway[];
  stalledSteps: FormationStep[];
  lastUpdatedAt: string | null;
};

type FormationProfileResponse = {
  ok: boolean;
  profile: FormationProfile;
};

type MemberDashboardFormationSectionProps = {
  memberId: string;
  apiBaseUrl?: string;
  apiKey?: string;
};

const sectionStyle: CSSProperties = {
  border: "1px solid #d9e2ec",
  borderRadius: 8,
  background: "#ffffff",
  padding: 16,
  display: "grid",
  gap: 14
};

const mutedStyle: CSSProperties = {
  color: "#52606d",
  fontSize: 13,
  margin: 0
};

const labelStyle: CSSProperties = {
  color: "#334e68",
  fontSize: 12,
  fontWeight: 700,
  margin: 0
};

function formatTimestamp(value: string | null | undefined): string {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

function pathwayProgress(pathway: FormationPathway): string {
  const completed = pathway.steps.filter((step) => step.completedAt).length;
  return `${completed} of ${pathway.steps.length} tracked steps completed`;
}

export function MemberDashboardFormationSection({
  memberId,
  apiBaseUrl = "/api",
  apiKey
}: MemberDashboardFormationSectionProps) {
  const [profile, setProfile] = useState<FormationProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProfile() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(
          `${apiBaseUrl}/visitors/${encodeURIComponent(memberId)}/dashboard-card/formation-profile`,
          {
            headers: apiKey ? { "x-api-key": apiKey } : undefined,
            signal: controller.signal
          }
        );
        if (!response.ok) {
          throw new Error("Formation profile is unavailable.");
        }

        const body = await response.json() as FormationProfileResponse;
        if (!body.ok || !body.profile) {
          throw new Error("Formation profile is unavailable.");
        }
        setProfile(body.profile);
      } catch (loadError) {
        if ((loadError as Error).name !== "AbortError") {
          setError("Formation profile is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();
    return () => controller.abort();
  }, [apiBaseUrl, apiKey, memberId]);

  if (isLoading) {
    return <section aria-label="Formation" style={sectionStyle}>Loading formation journey...</section>;
  }

  if (error || !profile) {
    return <section aria-label="Formation" style={sectionStyle}>{error}</section>;
  }

  const activePathway = profile.activePathway;

  return (
    <section aria-labelledby="formation-heading" style={sectionStyle}>
      <div>
        <h2 id="formation-heading" style={{ margin: 0, color: "#102a43", fontSize: 18 }}>
          Formation
        </h2>
        <p style={mutedStyle}>Last updated: {formatTimestamp(profile.lastUpdatedAt)}</p>
      </div>

      <div>
        <p style={labelStyle}>Active pathway progress</p>
        {activePathway ? (
          <>
            <p style={{ margin: "4px 0", fontWeight: 700 }}>
              {activePathway.pathwayType ?? activePathway.pathwayId}
            </p>
            <p style={mutedStyle}>{pathwayProgress(activePathway)}</p>
            <p style={mutedStyle}>Current step: {activePathway.currentStepId ?? "Not assigned"}</p>
          </>
        ) : (
          <p style={mutedStyle}>No active formation pathway.</p>
        )}
      </div>

      <div>
        <p style={labelStyle}>Stalled steps</p>
        {profile.stalledSteps.length === 0 ? (
          <p style={mutedStyle}>No stalled steps.</p>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {profile.stalledSteps.map((step) => (
              <li key={step.stepId} style={{ color: "#7c2d12", fontSize: 13 }}>
                {step.stepId}: {step.reason ?? "Needs attention"}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <p style={labelStyle}>Completed pathways</p>
        {profile.history.length === 0 ? (
          <p style={mutedStyle}>No completed pathways recorded.</p>
        ) : (
          <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
            {profile.history.map((pathway) => (
              <li key={pathway.pathwayId} style={{ color: "#243b53", fontSize: 13 }}>
                {pathway.pathwayType ?? pathway.pathwayId} completed {formatTimestamp(pathway.completedAt)}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}