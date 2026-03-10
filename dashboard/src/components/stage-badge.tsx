import type { CSSProperties } from "react";

export function StageBadge({ stage }: { stage: string | null | undefined }) {
  const value = stage && stage.trim().length > 0 ? stage : "Unknown";

  const style: CSSProperties = {
    display: "inline-block",
    padding: "4px 10px",
    borderRadius: 9999,
    fontSize: 12,
    fontWeight: 700,
    background: "#e5e7eb",
    color: "#111827"
  };

  return <span style={style}>{value}</span>;
}
