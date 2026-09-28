"use client";

import { useId, useState } from "react";
import type {
  RecommendationRecord,
  SellerDecisionInput,
} from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import { actionLabels, LevelBadge, Notice, readable } from "./presentation";

export function RecommendationPanel({
  recommendation,
  draft,
  onDraftChange,
  onGenerate,
  onDecision,
  generating,
  saving,
  saveError,
  success,
  sample,
}: {
  recommendation: RecommendationRecord;
  draft: string;
  onDraftChange: (text: string) => void;
  onGenerate: () => void;
  onDecision: (input: SellerDecisionInput) => void;
  generating: boolean;
  saving: boolean;
  saveError: string | null;
  success: string | null;
  sample: boolean;
}) {
  const editorId = useId();
  const noteId = useId();
  const [note, setNote] = useState("");
  const [escalating, setEscalating] = useState(false);
  const [submittedDraft, setSubmittedDraft] = useState<string | null>(null);
  const [submittedKind, setSubmittedKind] = useState<
    "reply" | "escalation" | null
  >(null);
  const busy = generating || saving;
  const needsEscalation =
    recommendation.action === "ESCALATE" || recommendation.risk === "high";
  const clarification = recommendation.action === "ASK_CLARIFICATION";
  const dirty = draft !== (recommendation.draft ?? "");
  const hasEvidence = recommendation.evidence.length > 0;
  const canSaveDraft = !needsEscalation && (clarification || hasEvidence);
  const alreadySaved = Boolean(
    success && submittedKind === "reply" && submittedDraft === draft,
  );
  const escalationRecorded = Boolean(success && submittedKind === "escalation");

  function saveDraft() {
    setSubmittedDraft(draft);
    setSubmittedKind("reply");
    onDecision(
      clarification
        ? { decision: "ask_clarification", editedDraft: draft.trim() }
        : dirty ||
            !recommendation.draft ||
            recommendation.action === "DRAFT_FOR_SELLER"
          ? { decision: "edit", editedDraft: draft.trim() }
          : { decision: "approve" },
    );
  }

  return (
    <section
      className={`recommendation-card${needsEscalation ? " recommendation-escalate" : ""}`}
      aria-labelledby={`${editorId}-title`}
    >
      <div className="recommendation-heading">
        <span className="recommendation-symbol">
          <Icon name={needsEscalation ? "shield" : "spark"} size={21} />
        </span>
        <div>
          <span className="subtle-label">Recommended next step</span>
          <h3 id={`${editorId}-title`}>
            {actionLabels[recommendation.action]}
          </h3>
        </div>
        <LevelBadge kind="risk" level={recommendation.risk} />
      </div>
      <ul className="reason-list">
        {recommendation.reasons.map((reason, index) => (
          <li key={`${reason}-${index}`}>
            <Icon name="check" size={14} />
            <span>{readable(reason)}</span>
          </li>
        ))}
      </ul>
      <div className="recommendation-facts">
        <span>
          {Number.isFinite(recommendation.confidence) &&
          recommendation.confidence !== null
            ? `${Math.round(recommendation.confidence * 100)}% ${sample ? "sample recommendation" : "recommendation"} confidence`
            : "Recommendation confidence unavailable"}
        </span>
        <span>
          {recommendation.evidence.length} evidence{" "}
          {recommendation.evidence.length === 1 ? "source" : "sources"}
        </span>
      </div>
      {recommendation.modelStatus === "fallback" && (
        <Notice variant="warning">
          {sample
            ? recommendation.modelNotice
            : recommendation.modelNotice ||
              "Automatic drafting is unavailable. Review the evidence and prepare a response manually."}
        </Notice>
      )}
      {!needsEscalation && !canSaveDraft && (
        <Notice variant="warning">
          No evidence supports a reply. Record an escalation so a person can
          check this request.
        </Notice>
      )}
      {canSaveDraft && (
        <div className="draft-editor">
          <div className="editor-label">
            <label htmlFor={editorId}>
              {clarification ? "Clarification question" : "Reply draft"}
            </label>
            {dirty && <span>Unsaved edits</span>}
          </div>
          <textarea
            id={editorId}
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            rows={5}
            maxLength={5000}
            placeholder={
              clarification
                ? "Ask one focused question about the missing details…"
                : "Review the evidence and write your response…"
            }
            disabled={busy}
            aria-describedby={`${editorId}-help`}
          />
          <div className="editor-footnote" id={`${editorId}-help`}>
            <span>
              {clarification
                ? "Ask for the details you need; avoid making a commitment."
                : "Check the facts and wording before recording your decision."}
            </span>
            <span>{draft.length}/5,000</span>
          </div>
        </div>
      )}
      {(needsEscalation || escalating) && (
        <div className="escalation-note">
          <label htmlFor={noteId}>
            Handoff note <span>(optional)</span>
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What should the person reviewing this case check?"
            rows={2}
            maxLength={1000}
            disabled={busy}
          />
        </div>
      )}
      {saveError && (
        <Notice variant="error">{saveError} Your text is still here.</Notice>
      )}
      {success && <Notice variant="success">{success}</Notice>}
      <div className="decision-actions">
        {canSaveDraft && !escalating && (
          <button
            className="button primary"
            disabled={busy || !draft.trim() || alreadySaved}
            onClick={saveDraft}
          >
            <Icon
              name={saving ? "refresh" : "check"}
              size={16}
              className={saving ? "spin" : ""}
            />
            {saving
              ? "Recording…"
              : alreadySaved
                ? "Decision recorded"
                : clarification
                  ? "Record clarification"
                  : dirty || !recommendation.draft
                    ? "Save edited draft"
                    : recommendation.action === "DRAFT_FOR_SELLER"
                      ? "Save reviewed draft"
                      : "Record approval"}
          </button>
        )}
        {needsEscalation || escalating || !canSaveDraft ? (
          <button
            className="button primary"
            disabled={busy || escalationRecorded}
            onClick={() => {
              setSubmittedDraft(draft);
              setSubmittedKind("escalation");
              onDecision({
                decision: "escalate",
                ...(note.trim() ? { note: note.trim() } : {}),
              });
            }}
          >
            <Icon
              name={saving ? "refresh" : "shield"}
              size={16}
              className={saving ? "spin" : ""}
            />
            {saving
              ? "Recording…"
              : escalationRecorded
                ? "Escalation recorded"
                : "Record escalation"}
          </button>
        ) : (
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => setEscalating(true)}
          >
            Escalate instead
          </button>
        )}
        {escalating && !needsEscalation && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => setEscalating(false)}
          >
            Back to draft
          </button>
        )}
      </div>
      <p className="no-send-note">
        <Icon name="shield" size={13} />
        {sample
          ? "Preview only. Decisions reset on reload; no message is sent."
          : "This records your decision. No buyer message is sent."}
      </p>
      <div className="recommendation-bottom">
        <span>Policy {recommendation.policyVersion}</span>
        <button
          className="text-button"
          disabled={busy || dirty}
          onClick={onGenerate}
          title={
            dirty
              ? "Save or reset draft edits before generating again"
              : undefined
          }
        >
          <Icon name="refresh" size={13} className={generating ? "spin" : ""} />
          {generating
            ? "Preparing…"
            : sample
              ? "Refresh sample"
              : "Generate again"}
        </button>
        {dirty && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => onDraftChange(recommendation.draft ?? "")}
          >
            Reset edits
          </button>
        )}
      </div>
    </section>
  );
}
