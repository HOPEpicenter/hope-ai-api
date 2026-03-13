"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FollowupRowActionButton,
  FollowupRowActionError,
  FollowupRowActionStack
} from "@/components/followup-row-action-ui";

const MY_ASSIGNEE = (process.env.NEXT_PUBLIC_FOLLOWUPS_MY_ASSIGNEE ?? "").trim();

type Props = {
  visitorId: string;
  assignedToOwnerId?: string | null;
  needsFollowup: boolean;
};

export function FollowupAssignButton({
  visitorId,
  assignedToOwnerId,
  needsFollowup
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsFollowup || !MY_ASSIGNEE || assignedToOwnerId === MY_ASSIGNEE) {
    return null;
  }

  async function onClick() {
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
          assigneeId: MY_ASSIGNEE
        })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/assign failed with status ${response.status}`);
      }

      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign followup.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FollowupRowActionStack>
      <FollowupRowActionButton
        label="Assign to me"
        busyLabel="Assigning..."
        isSubmitting={isSubmitting}
        onClick={onClick}
      />
      {error ? <FollowupRowActionError message={error} /> : null}
    </FollowupRowActionStack>
  );
}
