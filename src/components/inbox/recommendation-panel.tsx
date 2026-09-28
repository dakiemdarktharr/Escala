"use client";

import { useId } from "react";
import type { RecommendationRecord, SendReplyInput } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import { LevelBadge, Notice, readable } from "./presentation";

export function RecommendationPanel({
  recommendation, onEdit, onSend, onDecline, onGenerate, busy, sample,
}: {
  recommendation: RecommendationRecord;
  onEdit: () => void;
  onSend: (mode: SendReplyInput["mode"], approved: boolean) => void;
  onDecline: () => void;
  onGenerate: () => void;
  busy: boolean;
  sample: boolean;
}) {
  const titleId = useId();
  const delivery = recommendation.deliveryState ??
    (recommendation.risk === "high" ? "APPROVAL_REQUIRED" : "REVIEW_REQUIRED");
  const approval = delivery === "APPROVAL_REQUIRED";
  const pending = !recommendation.status || recommendation.status === "pending";
  const hasDraft = Boolean(recommendation.draft?.trim());
  const source = recommendation.draftSource ??
    (recommendation.modelStatus === "live" ? "openai" : "none");
  const deliveryLabel = {
    AUTO_SEND: "Auto-send eligible",
    APPROVAL_REQUIRED: "Seller approval required",
    REVIEW_REQUIRED: "Suggested reply — review required",
    MANUAL_ONLY: "Manual reply required",
  }[delivery];

  return (
    <section className="recommendation-card" aria-labelledby={titleId}>
      <div className="recommendation-heading">
        <span className="recommendation-symbol"><Icon name="spark" size={21} /></span>
        <div>
          <span className="subtle-label">Recommended next step</span>
          <h3 id={titleId}>{recommendation.recommendedStep || "Review buyer request"}</h3>
        </div>
        <LevelBadge kind="risk" level={recommendation.risk} />
      </div>
      <p className="context-explanation">{deliveryLabel}</p>
      {delivery === "REVIEW_REQUIRED" && <p className="context-explanation">{recommendation.confidence === null
        ? "Confidence is unavailable. Review the suggested reply before sending."
        : recommendation.confidence < recommendation.confidenceThreshold
          ? "Confidence is below the automatic-send threshold. Review the draft, edit it or write your own reply."
          : "This draft requires seller review before delivery."}</p>}
      <ul className="reason-list">
        {recommendation.reasons.map((reason, index) => (
          <li key={`${reason}-${index}`}><Icon name="check" size={14} /><span>{readable(reason)}</span></li>
        ))}
      </ul>
      <div className="recommendation-facts">
        <span>{recommendation.confidence !== null && Number.isFinite(recommendation.confidence)
          ? `${Math.round(recommendation.confidence * 100)}% recommendation confidence`
          : "Recommendation confidence unavailable"}</span>
        <span>{recommendation.evidence.length} evidence sources</span>
        <span>{sample ? "Sample template" : source === "openai" ? "OpenAI draft" : source === "template" ? "Reviewed template fallback" : "No live draft source"}</span>
      </div>
      {Number.isFinite(recommendation.confidenceThreshold) && (
        <p className="context-footnote">Automatic-send threshold: {Math.round(recommendation.confidenceThreshold * 100)}%. Risk approval is required independently of confidence.</p>
      )}
      {recommendation.modelStatus === "fallback" && (
        <Notice variant="warning">{recommendation.modelNotice || "Live OpenAI drafting is unavailable. The source of any fallback draft is labeled above; you can still write a manual reply."}</Notice>
      )}
      {hasDraft && (
        <div className="suggested-reply">
          <h4>Suggested reply</h4>
          <p>{recommendation.draft}</p>
        </div>
      )}
      {!pending && <Notice>Suggestion {recommendation.status === "sent" ? "sent in the simulated conversation" : "declined"}. You can still write a new reply below.</Notice>}
      <div className="decision-actions">
        {pending && hasDraft && delivery !== "MANUAL_ONLY" && (
          <>
            <button className="button primary" disabled={busy} onClick={() => onSend("seller", approval)}>{approval ? "Approve & send" : "Send suggested reply"}</button>
            <button className="button secondary" disabled={busy} onClick={onEdit}>Edit</button>
            {delivery === "AUTO_SEND" && <button className="button secondary" disabled={busy} onClick={() => onSend("automatic", false)}>Simulate automatic send</button>}
          </>
        )}
        {pending && <button className="text-button" disabled={busy} onClick={onDecline}>Decline suggestion</button>}
      </div>
      <p className="no-send-note"><Icon name="shield" size={13} />{sample ? "Sample only: replies reset on reload." : "Delivery is simulated in Escala. No marketplace message or order change occurs."}</p>
      <div className="recommendation-bottom">
        <span>Policy {recommendation.policyVersion}</span>
        <button className="text-button" disabled={busy} onClick={onGenerate}><Icon name="refresh" size={13} />{sample ? "Refresh sample" : "Generate again"}</button>
      </div>
    </section>
  );
}
