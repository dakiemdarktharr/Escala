"use client";

import { useId } from "react";
import type { RecommendationRecord, SendReplyInput } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import { readable } from "./presentation";

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
  const source = recommendation.draftSource ?? "none";
  const label = {
    AUTO_SEND: "Prepared for review",
    APPROVAL_REQUIRED: "Requires approval",
    REVIEW_REQUIRED: "Ready for review",
    MANUAL_ONLY: "Manual handling",
  }[delivery];
  if (!recommendation.draft?.trim()) return null;

  return (
    <section className="recommendation-card" aria-labelledby={titleId}>
      <div className="copilot-source">
        <span><Icon name={source === "openai" ? "spark" : "file"} size={14} />{sample ? "Sample template" : recommendation.generationProvider === "test_stub" ? "Local test candidate · no live AI" : source === "openai" ? "Escala suggested · OpenAI" : source === "template" ? "Template draft · live AI unavailable" : "Suggested reply · source unavailable"}</span>
        <span className={`badge ${approval ? "level-high" : delivery === "AUTO_SEND" ? "status-safe" : "level-medium"}`}>{label}</span>
      </div>
      <h3 id={titleId}>{recommendation.recommendedStep || "Review buyer request"}</h3>
      <p className="draft-reason">{recommendation.reasons[0] ? readable(recommendation.reasons[0]) : "Review the prepared reply below before sending."}</p>
      <div className="copilot-actions">
        <details className="copilot-details">
          <summary>Original suggestion & options</summary>
          <div className="copilot-detail-content">
            <div className="suggested-reply"><p>{recommendation.draft}</p></div>
            <p>Risk: {recommendation.risk}. {recommendation.confidence !== null && Number.isFinite(recommendation.confidence) ? `${Math.round(recommendation.confidence * 100)}% recommendation confidence.` : "Recommendation confidence unavailable; seller review is required."}</p>
            {Number.isFinite(recommendation.confidenceThreshold) && <p>Automatic-send threshold: {Math.round(recommendation.confidenceThreshold * 100)}%. Sensitive-action approval is independent of confidence.</p>}
            <ul>{recommendation.reasons.map((reason, index) => <li key={index}>{readable(reason)}</li>)}</ul>
            {recommendation.modelStatus === "fallback" && <p>{recommendation.modelNotice || "Live OpenAI drafting is unavailable. Manual replies remain available."}</p>}
            <p>{sample ? "Sample only; replies reset on reload." : "Simulated delivery in Escala. No marketplace message or order change occurs."} Policy {recommendation.policyVersion}.</p>
            <div className="decision-actions">
              {pending && delivery !== "MANUAL_ONLY" && <button className="button secondary" disabled={busy} onClick={() => onSend("seller", approval)}>{approval ? "Approve & send original" : "Send original"}</button>}
              {pending && <button className="text-button" disabled={busy} onClick={onEdit}>Replace composer with original</button>}
              {pending && <button className="text-button" disabled={busy} onClick={onDecline}>Discard suggestion</button>}
              <button className="text-button" disabled={busy} onClick={onGenerate}><Icon name="refresh" size={13} />{sample ? "Refresh sample" : "Generate again"}</button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
