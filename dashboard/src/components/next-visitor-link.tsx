"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Visitor = {
  visitorId: string;
};

const linkStyle = {
  color: "#065f46",
  textDecoration: "underline",
  fontWeight: 700
} as const;

export function NextVisitorLink({
  visitorId,
  preset
}: {
  visitorId: string;
  preset: string;
}) {
  const [nextId, setNextId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/dashboard/visitors?preset=${encodeURIComponent(preset)}`);
        const data = (await response.json()) as { visitors?: Visitor[] };

        const list = data.visitors ?? [];
        const index = list.findIndex((item) => item.visitorId === visitorId);

        if (index >= 0 && index < list.length - 1) {
          setNextId(list[index + 1].visitorId);
        }
      } catch {
        setNextId(null);
      }
    }

    void load();
  }, [visitorId, preset]);

  if (!nextId) {
    return (
      <Link href={`/visitors?preset=${encodeURIComponent(preset)}`} style={linkStyle}>
        Next visitor
      </Link>
    );
  }

  return (
    <Link href={`/visitors/${nextId}?preset=${encodeURIComponent(preset)}`} style={linkStyle}>
      Next visitor
    </Link>
  );
}
