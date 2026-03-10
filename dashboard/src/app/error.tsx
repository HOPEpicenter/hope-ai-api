"use client";

import { PageState } from "@/components/page-state";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <section style={{ display: "grid", gap: 16 }}>
      <PageState
        tone="error"
        title="Something went wrong"
        message={error.message || "The dashboard page could not be loaded."}
      >
        <button
          type="button"
          onClick={reset}
          style={{
            border: "1px solid #d1d5db",
            background: "#fff",
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            fontWeight: 600
          }}
        >
          Try again
        </button>
      </PageState>
    </section>
  );
}
