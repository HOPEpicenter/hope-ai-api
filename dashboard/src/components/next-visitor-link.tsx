"use client";

import Link from "next/link";

const linkStyle = {
  color: "#065f46",
  textDecoration: "underline",
  fontWeight: 700
} as const;

export function NextVisitorLink({
  nextVisitorId,
  preset
}: {
  nextVisitorId: string | null;
  preset: string;
}) {
  if (!nextVisitorId) {
    return (
      <Link href={`/visitors?preset=${encodeURIComponent(preset)}`} style={linkStyle}>
        Next visitor
      </Link>
    );
  }

  return (
    <Link href={`/visitors/${nextVisitorId}?preset=${encodeURIComponent(preset)}`} style={linkStyle}>
      Next visitor
    </Link>
  );
}
