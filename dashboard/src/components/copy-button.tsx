"use client";

import { useState } from "react";

export function CopyButton({
  value,
  label = "Copy"
}: {
  value: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      style={{
        border: "1px solid #d1d5db",
        background: copied ? "#ecfdf5" : "#fff",
        borderRadius: 10,
        padding: "6px 10px",
        cursor: "pointer",
        fontSize: 12,
        fontWeight: 600,
        color: "#111827"
      }}
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
