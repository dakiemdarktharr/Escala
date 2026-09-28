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
    AUTO_SEND: "Auto-send eligible",
    APPROVAL_REQUIRED: "Seller approval required",
    REVIEW_REQUIRED: "Review required",
    MANUAL_ONLY: "Manual reply required",
  }[delivery];
  if (!recommendation.draft?.trim()) return null;

  return (
    <section className="recommendation-card" aria-labelledby={titleId}>
      <div className="copilot-source">
        <span><Icon name={source === "openai" ? "spark" : "file"} size={14} />{sample ? "Sample template" : source === "openai" ? "AI-generated suggestion · OpenAI" : source === "template" ? "Reviewed template · live AI unavailable" : "Suggested reply · source unavailable"}</span>
        <span className={`badge ${approval ? "level-high" : delivery === "AUTO_SEND" ? "status-safe" : "level-medium"}`}>{label}</span>
      </div>
      <h3 id={titleId}>{recommendation.recommendedStep || "Review buyer request"}</h3>
      <div className="suggested-reply"><p>{recommendation.draft}</p></div>
      <div className="copilot-actions">
        {pending && delivery !== "MANUAL_ONLY" && <>
          <button className="button primary" disabled={busy} onClick={() => onSend("seller", approval)}>{approval ? "Approve & send" : "Send suggestion"}</button>
          <button className="button secondary" disabled={busy} onClick={onEdit}><Icon name="edit" size={14} />Edit</button>
        </>}
        {pending && <button className="text-button" disabled={busy} onClick={onDecline}>Decline</button>}
        <details className="copilot-details">
          <summary>Details & options</summary>
          <div className="copilot-detail-content">
            <p>Risk: {recommendation.risk}. {recommendation.confidence !== null && Number.isFinite(recommendation.confidence) ? `${Math.round(recommendation.confidence * 100)}% recommendation confidence.` : "Recommendation confidence unavailable; seller review is required."}</p>
            {Number.isFinite(recommendation.confidenceThreshold) && <p>Automatic-send threshold: {Math.round(recommendation.confidenceThreshold * 100)}%. Sensitive-action approval is independent of confidence.</p>}
            <ul>{recommendation.reasons.map((reason, index) => <li key={index}>{readable(reason)}</li>)}</ul>
            {recommendation.modelStatus === "fallback" && <p>{recommendation.modelNotice || "Live OpenAI drafting is unavailable. Manual replies remain available."}</p>}
            <p>{sample ? "Sample only; replies reset on reload." : "Simulated delivery in Escala. No marketplace message or order change occurs."} Policy {recommendation.policyVersion}.</p>
            <div className="decision-actions">
              {pending && delivery === "AUTO_SEND" && <button className="button secondary" disabled={busy} onClick={() => onSend("automatic", false)}>Simulate automatic send</button>}
              <button className="text-button" disabled={busy} onClick={onGenerate}><Icon name="refresh" size={13} />{sample ? "Refresh sample" : "Generate again"}</button>
            </div>
          </div>
        </details>
      </div>
    </section>
  );
}
