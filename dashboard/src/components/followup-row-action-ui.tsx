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

const successStyle: CSSProperties = {
  background: "#ecfdf5",
  border: "1px solid #a7f3d0",
  color: "#065f46",
  borderRadius: 8,
  padding: 8,
  fontSize: 12,
  fontWeight: 600
};

type FollowupRowActionButtonProps = {
  label: string;
  busyLabel: string;
  successLabel?: string;
  isSubmitting: boolean;
  isSuccess?: boolean;
  onClick: () => void;
};

export function FollowupRowActionButton({
  label,
  busyLabel,
  successLabel,
  isSubmitting,
  isSuccess = false,
  onClick
}: FollowupRowActionButtonProps) {
  const disabled = isSubmitting || isSuccess;
  const text = isSubmitting ? busyLabel : isSuccess ? (successLabel ?? label) : label;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...buttonStyle,
        border: isSuccess ? "1px solid #10b981" : buttonStyle.border,
        background: isSuccess ? "#ecfdf5" : buttonStyle.background,
        color: isSuccess ? "#065f46" : buttonStyle.color,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.7 : 1
      }}
    >
      {text}
    </button>
  );
}

export function FollowupRowActionError({ message }: { message: string }) {
  return <div style={errorStyle}>{message}</div>;
}

export function FollowupRowActionSuccess({ message }: { message: string }) {
  return <div style={successStyle}>{message}</div>;
}

export function FollowupRowActionStack({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gap: 6 }}>{children}</div>;
}
