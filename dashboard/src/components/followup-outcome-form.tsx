"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const OUTCOME_OPTIONS = [
  { value: "CONNECTED", label: "Connected" },
  { value: "LEFT_VOICEMAIL", label: "Left voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "FOLLOW_UP_LATER", label: "Follow up later" }
] as const;

type Props = {
  visitorId: string;
  lastFollowupOutcomeAt: string | null;
};

export function FollowupOutcomeForm({ visitorId, lastFollowupOutcomeAt }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [outcome, setOutcome] = useState<string>(OUTCOME_OPTIONS[0].value);
  const [note, setNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isResolved = lastFollowupOutcomeAt !== null;
  const isDisabled = isResolved || isSubmitting;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isDisabled) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/outcome", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          outcome,
          note
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/outcome failed with status ${response.status}`);
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("outcomeRecorded", "1");
      router.push(`${pathname}?${nextParams.toString()}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record followup outcome.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Record Followup Outcome</h2>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 9999,
              background: isResolved ? "#dcfce7" : "#fef3c7",
              color: isResolved ? "#166534" : "#92400e",
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {isResolved ? "Resolved" : "Available"}
          </span>
        </div>

        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          {isResolved
            ? "An outcome is already recorded for this followup."
            : "Record the final followup outcome. This should resolve the open followup queue item."}
        </p>
      </div>

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="followup-outcome" style={{ fontWeight: 600, color: "#111827" }}>
            Outcome
          </label>
          <select
            id="followup-outcome"
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
            disabled={isDisabled}
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: isDisabled ? "#f3f4f6" : "#fff",
              color: "#111827"
            }}
          >
            {OUTCOME_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="followup-note" style={{ fontWeight: 600, color: "#111827" }}>
            Note
          </label>
          <textarea
            id="followup-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isDisabled}
            rows={3}
            placeholder="Optional operator note"
            style={{
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: isDisabled ? "#f3f4f6" : "#fff",
              color: "#111827",
              resize: "vertical"
            }}
          />
        </div>

        {isResolved ? (
          <div
            style={{
              background: "#ecfdf5",
              border: "1px solid #a7f3d0",
              color: "#166534",
              borderRadius: 10,
              padding: 12,
              fontWeight: 600
            }}
          >
            Outcome already recorded. This followup is resolved.
          </div>
        ) : (
          <div
            style={{
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              color: "#4b5563",
              borderRadius: 10,
              padding: 12
            }}
          >
            Use this when the followup should be closed with a final outcome.
          </div>
        )}

        {error ? (
          <div
            style={{
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b",
              borderRadius: 10,
              padding: 12,
              fontWeight: 600
            }}
          >
            {error}
          </div>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={isDisabled}
            style={{
              background: isDisabled ? "#e5e7eb" : "#111827",
              color: isDisabled ? "#374151" : "#fff",
              border: "1px solid #111827",
              borderRadius: 10,
              padding: "10px 14px",
              fontWeight: 600,
              cursor: isDisabled ? "not-allowed" : "pointer",
              opacity: isSubmitting ? 0.7 : 1
            }}
          >
            {isResolved ? "Outcome recorded" : isSubmitting ? "Recording..." : "Record outcome"}
          </button>
        </div>
      </form>
    </div>
  );
}
