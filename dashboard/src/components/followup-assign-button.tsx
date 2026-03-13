"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

type Props = {
  visitorId: string;
  assignedToOwnerId?: string | null;
  needsFollowup: boolean;
};

export function FollowupAssignButton({
  visitorId,
  assignedToOwnerId,
  needsFollowup
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsFollowup || !MY_ASSIGNEE || assignedToOwnerId === MY_ASSIGNEE) {
    return null;
  }

  async function onClick() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/assign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          assigneeId: MY_ASSIGNEE
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/assign failed with status ${response.status}`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign followup.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button
        type="button"
        onClick={onClick}
        disabled={isSubmitting}
        style={{
          border: "1px solid #d1d5db",
          background: "#fff",
          color: "#111827",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 12,
          fontWeight: 600,
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1
        }}
      >
        {isSubmitting ? "Assigning..." : "Assign to me"}
      </button>

      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 8,
            padding: 8,
            fontSize: 12,
            fontWeight: 600
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
