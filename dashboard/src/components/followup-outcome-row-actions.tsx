"use client";

import { useEffect } from "react";
import {
  FollowupRowActionButton,
  FollowupRowActionError,
  FollowupRowActionStack,
  FollowupRowActionSuccess,
  useFollowupRowActionGroup
} from "@/components/followup-row-action-ui";

const ROW_OUTCOME_OPTIONS = [
  { value: "CONNECTED", label: "Connected" },
  { value: "LEFT_VOICEMAIL", label: "Left voicemail" },
  { value: "NO_ANSWER", label: "No answer" },
  { value: "NOT_INTERESTED", label: "Not interested" },
  { value: "FOLLOW_UP_LATER", label: "Follow up later" }
] as const;

const ACTION_ID = "outcome";

type Props = {
  visitorId: string;
  isEditing: boolean;
  hasRecordedOutcome: boolean;
  editingOutcome: string;
  editingNote: string;
  isSavingOutcome: boolean;
  isOutcomeSuccess: boolean;
  outcomeError: string | null;
  onStartOutcomeEdit: (visitorId: string) => void;
  onCancelOutcomeEdit: () => void;
  onEditingOutcomeChange: (value: string) => void;
  onEditingNoteChange: (value: string) => void;
  onSaveOutcome: (visitorId: string) => Promise<void>;
  onQuickOutcome: (visitorId: string, outcome: string) => void;
};

export function FollowupOutcomeRowActions({
  visitorId,
  isEditing,
  hasRecordedOutcome,
  editingOutcome,
  editingNote,
  isSavingOutcome,
  isOutcomeSuccess,
  outcomeError,
  onStartOutcomeEdit,
  onCancelOutcomeEdit,
  onEditingOutcomeChange,
  onEditingNoteChange,
  onSaveOutcome,
  onQuickOutcome
}: Props) {
  const actionGroup = useFollowupRowActionGroup();
  const showQuickOutcomeButtons = !hasRecordedOutcome;
  const isAnotherActionSubmitting =
    !!actionGroup?.activeActionId && actionGroup.activeActionId !== ACTION_ID;

  const disableQuickOutcomeButtons = isSavingOutcome || isOutcomeSuccess || isAnotherActionSubmitting;
  const disableMoreButton = isOutcomeSuccess || isAnotherActionSubmitting;

  useEffect(() => {
    if (!isSavingOutcome && actionGroup?.activeActionId === ACTION_ID) {
      actionGroup.setActiveActionId(null);
    }
  }, [actionGroup, isSavingOutcome]);

  function beginOutcomeAction() {
    actionGroup?.setActiveActionId(ACTION_ID);
  }

  return (
    <>
      {isEditing ? (
        <FollowupRowActionStack>
          <div
            style={{
              display: "grid",
              gap: 8,
              minWidth: 240,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              background: "#f9fafb"
            }}
          >
            <select
              value={editingOutcome}
              onChange={(event) => onEditingOutcomeChange(event.target.value)}
              disabled={isSavingOutcome || isOutcomeSuccess}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827"
              }}
            >
              {ROW_OUTCOME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <textarea
              value={editingNote}
              onChange={(event) => onEditingNoteChange(event.target.value)}
              disabled={isSavingOutcome || isOutcomeSuccess}
              rows={2}
              placeholder="Optional note"
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
                background: "#fff",
                color: "#111827",
                resize: "vertical"
              }}
            />

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <FollowupRowActionButton
                label="Save"
                busyLabel="Saving..."
                successLabel="Saved"
                isSubmitting={isSavingOutcome}
                isSuccess={isOutcomeSuccess}
                onClick={() => {
                  beginOutcomeAction();
                  void onSaveOutcome(visitorId);
                }}
              />

              <button
                type="button"
                onClick={onCancelOutcomeEdit}
                disabled={isSavingOutcome || isOutcomeSuccess}
                style={{
                  background: "#fff",
                  color: "#111827",
                  border: "1px solid #d1d5db",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: isSavingOutcome || isOutcomeSuccess ? "not-allowed" : "pointer",
                  opacity: isSavingOutcome || isOutcomeSuccess ? 0.7 : 1
                }}
              >
                Cancel
              </button>
            </div>
          </div>

          {outcomeError ? <FollowupRowActionError message={outcomeError} /> : null}
          {isOutcomeSuccess ? <FollowupRowActionSuccess message="Followup outcome recorded." /> : null}
        </FollowupRowActionStack>
      ) : null}

      {!isEditing ? (
        <FollowupRowActionStack>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {showQuickOutcomeButtons ? (
              <>
                <FollowupRowActionButton
                  label="Connected"
                  busyLabel="Saving..."
                  successLabel="Saved"
                  isSubmitting={isSavingOutcome}
                  isSuccess={isOutcomeSuccess}
                  isDisabled={isAnotherActionSubmitting}
                  onClick={() => {
                    beginOutcomeAction();
                    onQuickOutcome(visitorId, "CONNECTED");
                  }}
                />

                <FollowupRowActionButton
                  label="No answer"
                  busyLabel="Saving..."
                  successLabel="Saved"
                  isSubmitting={isSavingOutcome}
                  isSuccess={isOutcomeSuccess}
                  isDisabled={isAnotherActionSubmitting}
                  onClick={() => {
                    beginOutcomeAction();
                    onQuickOutcome(visitorId, "NO_ANSWER");
                  }}
                />
              </>
            ) : null}

            <button
              type="button"
              onClick={() => onStartOutcomeEdit(visitorId)}
              disabled={disableMoreButton}
              style={{
                background: "#fff",
                color: "#111827",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: disableMoreButton ? "not-allowed" : "pointer",
                opacity: disableMoreButton ? 0.7 : 1
              }}
            >
              More…
            </button>
          </div>

          {outcomeError ? <FollowupRowActionError message={outcomeError} /> : null}
          {isOutcomeSuccess ? <FollowupRowActionSuccess message="Followup outcome recorded." /> : null}
        </FollowupRowActionStack>
      ) : null}
    </>
  );
}

