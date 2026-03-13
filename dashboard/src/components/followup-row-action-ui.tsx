"use client";

import type { CSSProperties, ReactNode } from "react";

const buttonStyle: CSSProperties = {
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#111827",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 600
};

const errorStyle: CSSProperties = {
  background: "#fef2f2",
  border: "1px solid #fecaca",
  color: "#991b1b",
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
  fontWeight: 600
};

type FollowupRowActionButtonProps = {
  label: string;
  busyLabel: string;
  isSubmitting: boolean;
  onClick: () => void;
};

export function FollowupRowActionButton({
  label,
  busyLabel,
  isSubmitting,
  onClick
}: FollowupRowActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSubmitting}
      style={{
        ...buttonStyle,
        cursor: isSubmitting ? "not-allowed" : "pointer",
        opacity: isSubmitting ? 0.7 : 1
      }}
    >
      {isSubmitting ? busyLabel : label}
    </button>
  );
}

export function FollowupRowActionError({ message }: { message: string }) {
  return <div style={errorStyle}>{message}</div>;
}

export function FollowupRowActionStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: 6 }}>{children}</div>;
}
