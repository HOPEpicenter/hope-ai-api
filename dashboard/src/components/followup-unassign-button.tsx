"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FollowupRowActionButton,
  FollowupRowActionError,
  FollowupRowActionStack,
  FollowupRowActionSuccess
} from "@/components/followup-row-action-ui";

type Props = {
  visitorId: string;
  assignedToOwnerId?: string | null;
};

export function FollowupUnassignButton({
  visitorId,
  assignedToOwnerId
}: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!assignedToOwnerId) {
    return null;
  }

  async function onClick() {
    setIsSubmitting(true);
    setIsSuccess(false);
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

      setIsSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unassign followup.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <FollowupRowActionStack>
      <FollowupRowActionButton
        label="Unassign"
        busyLabel="Saving..."
        successLabel="Unassigned"
        isSubmitting={isSubmitting}
        isSuccess={isSuccess}
        onClick={onClick}
      />
      {error ? <FollowupRowActionError message={error} /> : null}
      {isSuccess ? <FollowupRowActionSuccess message="Followup unassigned." /> : null}
    </FollowupRowActionStack>
  );
}
