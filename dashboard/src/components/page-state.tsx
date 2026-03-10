import Link from "next/link";
import type { ReactNode } from "react";

type PageStateTone = "neutral" | "error";

type PageStateProps = {
  title: string;
  message: string;
  tone?: PageStateTone;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function PageState({
  title,
  message,
  tone = "neutral",
  actionHref,
  actionLabel,
  children
}: PageStateProps) {
  const isError = tone === "error";

  return (
    <div
      style={{
        background: "#fff",
        border: `1px solid ${isError ? "#fecaca" : "#e5e7eb"}`,
        borderRadius: 12,
        padding: 24
      }}
    >
      <h2 style={{ marginTop: 0, marginBottom: 8, color: isError ? "#991b1b" : "#111827" }}>
        {title}
      </h2>

      <p style={{ marginTop: 0, marginBottom: 0, color: "#4b5563" }}>{message}</p>

      {actionHref && actionLabel ? (
        <div style={{ marginTop: 16 }}>
          <Link
            href={actionHref}
            style={{
              display: "inline-block",
              textDecoration: "none",
              color: "#1d4ed8",
              fontWeight: 600
            }}
          >
            {actionLabel}
          </Link>
        </div>
      ) : null}

      {children ? <div style={{ marginTop: 16 }}>{children}</div> : null}
    </div>
  );
}
