"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

type MarkContactedFormProps = {
  visitorId: string;
  lastFollowupContactedAt: string | null;
};

export function MarkContactedForm({
  visitorId,
  lastFollowupContactedAt
}: MarkContactedFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const alreadyContacted = lastFollowupContactedAt !== null;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (alreadyContacted || isSubmitting) {
      return;
    }

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

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;

      if (!response.ok) {
        throw new Error(
          payload?.error ?? `POST /api/dashboard/followups/contact failed with status ${response.status}`
        );
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("contacted", "1");
      router.push(`${pathname}?${nextParams.toString()}`);
      router.refresh();
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to record followup contact."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 16,
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "grid", gap: 4 }}>
        <h2 style={{ margin: 0, fontSize: 18 }}>Contact</h2>
        <p style={{ margin: 0, color: "#4b5563" }}>
          Record when the visitor has been contacted for this assignment workflow.
        </p>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <button
          type="submit"
          disabled={alreadyContacted || isSubmitting}
          style={{
            border: "1px solid #111827",
            background: alreadyContacted ? "#e5e7eb" : "#111827",
            color: alreadyContacted ? "#374151" : "#ffffff",
            borderRadius: 10,
            padding: "10px 14px",
            fontWeight: 600,
            cursor: alreadyContacted || isSubmitting ? "not-allowed" : "pointer",
            opacity: isSubmitting ? 0.7 : 1
          }}
        >
          {alreadyContacted ? "Already contacted" : isSubmitting ? "Saving..." : "Mark contacted"}
        </button>

        {lastFollowupContactedAt ? (
          <span style={{ color: "#4b5563", fontSize: 14 }}>
            Contact already recorded.
          </span>
        ) : null}
      </form>

      {error ? (
        <div
          style={{
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            borderRadius: 12,
            padding: 12,
            fontWeight: 600
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
