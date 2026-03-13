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
  needsFollowup?: boolean;
};

export function FollowupContactButton({ visitorId, needsFollowup = true }: Props) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!needsFollowup) {
    return null;
  }

  async function onClick() {
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
        onClick={onClick}
      />
      {error ? <FollowupRowActionError message={error} /> : null}
      {isSuccess ? <FollowupRowActionSuccess message="Followup marked as contacted." /> : null}
    </FollowupRowActionStack>
  );
}
