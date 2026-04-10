"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FollowupRowActionButton,
  FollowupRowActionError,
  FollowupRowActionStack,
  FollowupRowActionSuccess,
  useFollowupRowActionGroup
} from "@/components/followup-row-action-ui";

const ACTION_ID = "unassign";

type Props = {
  visitorId: string;
  assignedToOwnerId?: string | null;
};

export function FollowupUnassignButton({
  visitorId,
  assignedToOwnerId
}: Props) {
  const router = useRouter();
  const actionGroup = useFollowupRowActionGroup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnotherActionSubmitting =
    !!actionGroup?.activeActionId && actionGroup.activeActionId !== ACTION_ID;

  if (!assignedToOwnerId) {
    return null;
  }

  async function onClick() {
    if (isSubmitting || isSuccess || isAnotherActionSubmitting) {
      return;
    }

    actionGroup?.setActiveActionId(ACTION_ID);
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
          visitorId,
          assignedToOwnerId
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
      actionGroup?.setActiveActionId(null);
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
        isDisabled={isAnotherActionSubmitting}
        onClick={onClick}
      />
      {error ? <FollowupRowActionError message={error} /> : null}
      {isSuccess ? <FollowupRowActionSuccess message="Followup unassigned." /> : null}
    </FollowupRowActionStack>
  );
}

