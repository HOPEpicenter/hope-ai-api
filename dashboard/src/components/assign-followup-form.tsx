"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

type AssignFollowupResponse = {
  ok?: boolean;
  visitorId?: string;
  assigneeId?: string;
  error?: string;
};

export function AssignFollowupForm({
  visitorId,
  assignedToOwnerId
}: {
  visitorId: string;
  assignedToOwnerId?: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [assigneeId, setAssigneeId] = useState(MY_ASSIGNEE || "ops-user-1");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAssigned = !!assignedToOwnerId;
  const isBusy = isSubmitting || isUnassigning;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/assign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId,
          assigneeId
        })
      });

      const data = (await response.json()) as AssignFollowupResponse;

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/assign failed with status ${response.status}`);
      }

      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("assigned", "1");
      nextParams.set("assigneeId", assigneeId);
      router.push(`${pathname}?${nextParams.toString()}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign followup.";
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onUnassign() {
    if (!assignedToOwnerId || isBusy) {
      return;
    }

    setIsUnassigning(true);
    setError(null);

    try {
      const response = await fetch("/api/dashboard/followups/unassign", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          visitorId
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/unassign failed with status ${response.status}`);
      }

      router.push(`/visitors/${visitorId}?assigned=1&assigneeId=`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to unassign followup.";
      setError(message);
    } finally {
      setIsUnassigning(false);
    }
  }

  return (
    <div
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 12,
        padding: 20,
        display: "grid",
        gap: 12
      }}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontSize: 18, color: "#111827" }}>Assign Followup</h2>
          <span
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 9999,
              background: isAssigned ? "#eff6ff" : "#fef3c7",
              color: isAssigned ? "#1d4ed8" : "#92400e",
              fontSize: 12,
              fontWeight: 700
            }}
          >
            {isAssigned ? "Assigned" : "Available"}
          </span>
        </div>

        <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>
          {isAssigned
            ? "This visitor is already assigned. You can reassign or remove the assignee."
            : "Add this visitor to the followups queue by assigning an operator."}
        </p>
      </div>

      {assignedToOwnerId ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: 12,
            border: "1px solid #dbeafe",
            borderRadius: 10,
            background: "#f8fbff"
          }}
        >
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 12, color: "#6b7280" }}>Current assignee</div>
            <div style={{ fontWeight: 700, color: "#111827" }}>{assignedToOwnerId}</div>
          </div>

          <button
            type="button"
            onClick={() => void onUnassign()}
            disabled={isBusy}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              background: "#fff",
              color: "#111827",
              font: "inherit",
              cursor: isBusy ? "default" : "pointer",
              opacity: isBusy ? 0.7 : 1
            }}
          >
            {isUnassigning ? "Unassigning..." : "Unassign Followup"}
          </button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gap: 6 }}>
          <label htmlFor="assigneeId" style={{ fontWeight: 600 }}>
            {assignedToOwnerId ? "Reassign to" : "Assignee"}
          </label>
          <select
            id="assigneeId"
            value={assigneeId}
            onChange={(event) => setAssigneeId(event.target.value)}
            disabled={isBusy}
            style={{
              padding: 10,
              border: "1px solid #d1d5db",
              borderRadius: 8,
              font: "inherit",
              background: isBusy ? "#f3f4f6" : "#fff"
            }}
          >
            <option value="ops-user-1">ops-user-1</option>
            <option value="ops-user-2">ops-user-2</option>
          </select>
        </div>

        {error ? (
          <div
            style={{
              padding: 10,
              borderRadius: 8,
              background: "#fef2f2",
              border: "1px solid #fecaca",
              color: "#991b1b"
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: "flex", justifyContent: "flex-start" }}>
          <button
            type="submit"
            disabled={isBusy}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #111827",
              background: "#111827",
              color: "#fff",
              font: "inherit",
              cursor: isBusy ? "default" : "pointer",
              opacity: isBusy ? 0.7 : 1
            }}
          >
            {isSubmitting ? "Saving..." : assignedToOwnerId ? "Reassign Followup" : "Assign Followup"}
          </button>
        </div>
      </form>
    </div>
  );
}

