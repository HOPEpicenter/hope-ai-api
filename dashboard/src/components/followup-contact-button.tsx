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

const ACTION_ID = "contact";

type Props = {
  visitorId: string;
  needsFollowup?: boolean;
};

export function FollowupContactButton({ visitorId, needsFollowup = true }: Props) {
  const router = useRouter();
  const actionGroup = useFollowupRowActionGroup();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAnotherActionSubmitting =
    !!actionGroup?.activeActionId && actionGroup.activeActionId !== ACTION_ID;

  if (!needsFollowup) {
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
      const response = await fetch("/api/dashboard/followups/contact", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({ visitorId })
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || `POST /api/dashboard/followups/contact failed with status ${response.status}`);
      }

      setIsSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, 700));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to mark followup as contacted.");
    } finally {
      setIsSubmitting(false);
      actionGroup?.setActiveActionId(null);
    }
  }

  return (
    <FollowupRowActionStack>
      <FollowupRowActionButton
        label="Mark contacted"
        busyLabel="Saving..."
        successLabel="Saved"
        isSubmitting={isSubmitting}
        isSuccess={isSuccess}
        isDisabled={isAnotherActionSubmitting}
        onClick={onClick}
      />
      {error ? <FollowupRowActionError message={error} /> : null}
      {isSuccess ? <FollowupRowActionSuccess message="Followup marked as contacted." /> : null}
    </FollowupRowActionStack>
  );
}

