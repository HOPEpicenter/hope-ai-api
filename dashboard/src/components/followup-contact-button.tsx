"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  visitorId: string;
};

export function FollowupContactButton({ visitorId }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({ visitorId })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/contact failed with status ${response.status}`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark followup as contacted.");
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
          padding: "8px 10px",
          fontSize: 12,
          fontWeight: 600,
          cursor: isSubmitting ? "not-allowed" : "pointer",
          opacity: isSubmitting ? 0.7 : 1
        }}
      >
        {isSubmitting ? "Saving..." : "Mark contacted"}
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
