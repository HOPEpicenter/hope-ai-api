"use client";

import { useEffect } from "react";
import { useFollowupRowActionGroup } from "@/components/followup-row-action-ui";

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

  const disableQuickOutcomeButtons = isSavingOutcome || isAnotherActionSubmitting;
  const disableMoreButton = isAnotherActionSubmitting;

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
            disabled={isSavingOutcome}
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
            disabled={isSavingOutcome}
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

          {outcomeError ? (
            <div
              style={{
                background: "#fef2f2",
                border: "1px solid #fecaca",
                color: "#991b1b",
                borderRadius: 8,
                padding: 8,
                fontSize: 12,
                fontWeight: 600
              }}
            >
              {outcomeError}
            </div>
          ) : null}

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                beginOutcomeAction();
                void onSaveOutcome(visitorId);
              }}
              disabled={isSavingOutcome}
              style={{
                background: "#111827",
                color: "#fff",
                border: "1px solid #111827",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: isSavingOutcome ? "not-allowed" : "pointer",
                opacity: isSavingOutcome ? 0.7 : 1
              }}
            >
              {isSavingOutcome ? "Saving..." : "Save"}
            </button>

            <button
              type="button"
              onClick={onCancelOutcomeEdit}
              disabled={isSavingOutcome}
              style={{
                background: "#fff",
                color: "#111827",
                border: "1px solid #d1d5db",
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 12,
                fontWeight: 600,
                cursor: isSavingOutcome ? "not-allowed" : "pointer"
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {!isEditing ? (
        <>
          {showQuickOutcomeButtons ? (
            <>
              <button
                type="button"
                onClick={() => {
                  beginOutcomeAction();
                  onQuickOutcome(visitorId, "CONNECTED");
                }}
                disabled={disableQuickOutcomeButtons}
                style={{
                  background: "#ecfdf5",
                  color: "#166534",
                  border: "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: disableQuickOutcomeButtons ? "not-allowed" : "pointer",
                  opacity: disableQuickOutcomeButtons ? 0.7 : 1
                }}
              >
                Connected
              </button>

              <button
                type="button"
                onClick={() => {
                  beginOutcomeAction();
                  onQuickOutcome(visitorId, "NO_ANSWER");
                }}
                disabled={disableQuickOutcomeButtons}
                style={{
                  background: "#fef2f2",
                  color: "#991b1b",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "8px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: disableQuickOutcomeButtons ? "not-allowed" : "pointer",
                  opacity: disableQuickOutcomeButtons ? 0.7 : 1
                }}
              >
                No answer
              </button>
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
        </>
      ) : null}
    </>
  );
}
