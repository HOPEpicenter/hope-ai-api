"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Response = {
  ok?: boolean;
  visitorId?: string;
  error?: string;
};

export function MarkContactedButton({ visitorId }: { visitorId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ visitorId })
      });

      const data = (await response.json()) as Response;

      if (!response.ok) {
        throw new Error(data.error || "Failed to mark contacted.");
      }

      router.push(`/visitors/${visitorId}?contacted=1`);
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to mark contacted.";

      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        onClick={onClick}
        disabled={loading}
        style={{
          padding: "10px 14px",
          borderRadius: 8,
          border: "1px solid #111827",
          background: "#111827",
          color: "#fff",
          cursor: loading ? "default" : "pointer",
          opacity: loading ? 0.7 : 1
        }}
      >
        {loading ? "Marking..." : "Mark Contacted"}
      </button>

      {error ? (
        <div
          style={{
            padding: 10,
            borderRadius: 8,
            background: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b"
          }}
        >
          {error}
        </div>
      ) : null}
    </div>
  );
}
