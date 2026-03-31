"use client";

import { formatFormationEventSummary } from "@/lib/format-formation-event-summary";

type FormationOverviewItem = {
  id?: string | null;
  rowKey?: string | null;
  visitorId?: string | null;
  type?: string | null;
  occurredAt?: string | null;
  metadata?: any;
};

type Props = {
  metrics: {
    formationEvents24h: number;
    nextStepsSelected24h: number;
  };
  recentItems: FormationOverviewItem[];
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function shortVisitorId(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  return value.length > 8 ? value.slice(0, 8) : value;
}

export function FormationOverviewCard({ metrics, recentItems }: Props) {
  return (
    <div className="rounded-xl border p-5 space-y-4">
      <div>
        <h3 className="text-base font-semibold">Formation Signals</h3>
        <p className="text-sm text-gray-600">
          Recent formation movement across visitors.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Formation Events (24h)</div>
          <div className="text-2xl font-semibold">{metrics.formationEvents24h}</div>
        </div>

        <div className="rounded border p-3">
          <div className="text-xs text-gray-500">Next Steps Selected (24h)</div>
          <div className="text-2xl font-semibold">{metrics.nextStepsSelected24h}</div>
        </div>
      </div>

      <div className="space-y-3">
        <div className="text-sm font-medium">Recent Formation Activity</div>

        {!recentItems.length ? (
          <div className="text-sm text-gray-500">No recent formation activity.</div>
        ) : (
          <div className="space-y-3">
            {recentItems.map((item) => (
              <div key={item.rowKey ?? item.id ?? `${item.type}-${item.occurredAt}`} className="rounded border p-3">
                <div className="text-sm font-medium">
                  {formatFormationEventSummary(item.type, item.metadata)}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  visitor {shortVisitorId(item.visitorId)} • {formatDate(item.occurredAt)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
