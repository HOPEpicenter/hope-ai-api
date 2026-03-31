"use client";

import { useEffect, useState } from "react";
import { FormationOverviewCard } from "@/components/formation-overview-card";

type FormationOverviewResponse = {
  ok?: boolean;
  recentItems?: any[];
  metrics?: {
    formationEvents24h: number;
    nextStepsSelected24h: number;
  };
  error?: string;
};

export function FormationOverviewSection() {
  const [formation, setFormation] = useState<FormationOverviewResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/dashboard/formation/overview");
        const text = await response.text();
        const json: FormationOverviewResponse = text ? JSON.parse(text) : {};

        if (!response.ok) {
          throw new Error(json.error || `Formation overview request failed with status ${response.status}`);
        }

        if (!cancelled) {
          setFormation(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected formation overview error.");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div style={{ border: "1px solid #fca5a5", background: "#fef2f2", borderRadius: 12, padding: 12, color: "#991b1b" }}>
        {error}
      </div>
    );
  }

  if (!formation) {
    return (
      <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, color: "#4b5563" }}>
        Loading formation signals...
      </div>
    );
  }

  return (
    <FormationOverviewCard
      metrics={formation.metrics ?? { formationEvents24h: 0, nextStepsSelected24h: 0 }}
      recentItems={formation.recentItems ?? []}
    />
  );
}
