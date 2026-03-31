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

export default function OverviewPage() {
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
          throw new Error(json.error || `Overview formation request failed with status ${response.status}`);
        }

        if (!cancelled) {
          setFormation(json);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unexpected overview load error.");
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-gray-600">
          Operator workspace for followups, visitors, and activity snapshots.
        </p>
      </div>

      {error ? (
        <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {formation ? (
        <FormationOverviewCard
          metrics={formation.metrics ?? { formationEvents24h: 0, nextStepsSelected24h: 0 }}
          recentItems={formation.recentItems ?? []}
        />
      ) : (
        <div className="rounded border p-4 text-sm text-gray-500">Loading overview...</div>
      )}
    </div>
  );
}
