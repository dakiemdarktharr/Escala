"use client";

import { useId } from "react";
import type { ThreadDetailResponse } from "@/domain/contracts";
import { Icon } from "@/components/ui/icon";
import { actionLabels, dateLabel, EmptyState, readable } from "./presentation";

export type ContextTab = "evidence" | "activity";

export function ContextPanel({
  detail,
  tab,
  onTabChange,
  sample,
}: {
  detail: ThreadDetailResponse;
  tab: ContextTab;
  onTabChange: (tab: ContextTab) => void;
  sample: boolean;
}) {
  const id = useId();
  const evidence = detail.recommendation?.evidence ?? detail.evidence;
  const events = [...detail.audit].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
  return (
    <div className="context-panel">
      <div className="context-title">
        <Icon name="book" size={18} />
        <h2>Conversation context</h2>
      </div>
      <div
        className="context-tabs"
        role="tablist"
        aria-label="Conversation context"
      >
        {(
          [
            ["evidence", "Evidence"],
            ["activity", "Activity"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            role="tab"
            id={`${id}-${value}`}
            aria-controls={`${id}-${value}-panel`}
            aria-selected={tab === value}
            tabIndex={tab === value ? 0 : -1}
            onClick={() => onTabChange(value)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const target =
                  event.key === "Home"
                    ? "evidence"
                    : event.key === "End"
                      ? "activity"
                      : tab === "evidence"
                        ? "activity"
                        : "evidence";
                onTabChange(target);
                document.getElementById(`${id}-${target}`)?.focus();
              }
            }}
          >
            {label}
            {value === "evidence" && <span>{evidence.length}</span>}
          </button>
        ))}
      </div>
      <div
        className="context-scroll"
        role="tabpanel"
        id={`${id}-${tab}-panel`}
        aria-labelledby={`${id}-${tab}`}
        tabIndex={0}
      >
        {tab === "evidence" ? (
          <>
            <section className="context-section">
              <div className="section-title">
                <Icon name="box" size={17} />
                <h3>Order snapshot</h3>
              </div>
              {detail.order ? (
                <div className="order-card">
                  <div className="order-product">
                    <span className="product-placeholder">
                      <Icon name="box" size={25} />
                    </span>
                    <div>
                      <strong>{detail.order.productName}</strong>
                      <span>Quantity {detail.order.quantity}</span>
                    </div>
                  </div>
                  <dl className="order-facts">
                    <div>
                      <dt>Order</dt>
                      <dd>#{detail.order.orderId}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd>{detail.order.status}</dd>
                    </div>
                    {detail.order.paymentStatus && (
                      <div>
                        <dt>Payment</dt>
                        <dd>{detail.order.paymentStatus}</dd>
                      </div>
                    )}
                    {detail.order.deliveryDeadline && (
                      <div>
                        <dt>Deadline</dt>
                        <dd>
                          {dateLabel(detail.order.deliveryDeadline, true)}
                        </dd>
                      </div>
                    )}
                  </dl>
                  <p className="context-footnote">
                    {sample
                      ? "Illustrative order for this sample."
                      : "Workspace snapshot; no live marketplace sync."}
                  </p>
                </div>
              ) : (
                <p className="context-explanation">
                  No order is linked to this conversation. Ask for details when
                  they’re needed.
                </p>
              )}
            </section>
            <section className="context-section">
              <div className="section-title">
                <Icon name="file" size={17} />
                <h3>Supporting knowledge</h3>
              </div>
              <p className="context-explanation">
                Review the source before recording a reply.
              </p>
              {evidence.length === 0 ? (
                <div className="evidence-empty">
                  <Icon name="alert" size={20} />
                  <strong>No supporting evidence</strong>
                  <p>
                    No verified answer is available. Keep this conversation in
                    seller review.
                  </p>
                </div>
              ) : (
                evidence.map((entry) => (
                  <details className="evidence-card" key={entry.id} open>
                    <summary>
                      <Icon name="file" size={17} />
                      <span>{entry.title}</span>
                      <Icon name="chevron" size={14} />
                    </summary>
                    <div className="evidence-body">
                      <p>{entry.snippet}</p>
                      <div className="evidence-meta">
                        <span>{readable(entry.source)}</span>
                        <span>v{entry.version}</span>
                      </div>
                      <span className="evidence-id" title={entry.id}>
                        {entry.id}
                      </span>
                    </div>
                  </details>
                ))
              )}
            </section>
            {detail.recommendation && (
              <div className="policy-note">
                <Icon name="shield" size={17} />
                <span>
                  Policy {detail.recommendation.policyVersion}
                  <br />
                  <small>Recommendations stay subject to seller review.</small>
                </span>
              </div>
            )}
          </>
        ) : (
          <section className="context-section">
            <div className="section-title">
              <Icon name="history" size={17} />
              <h3>Decision history</h3>
            </div>
            <p className="context-explanation">
              Recommendations and recorded seller decisions for this
              conversation.
            </p>
            {events.length === 0 ? (
              <EmptyState icon="history" title="No activity yet">
                Generate a recommendation to start the audit trail.
              </EmptyState>
            ) : (
              <ol className="audit-list">
                {events.map((event) => (
                  <li key={event.id}>
                    <span className={`audit-icon ${event.actor}`}>
                      <Icon
                        name={event.actor === "seller" ? "check" : "spark"}
                        size={13}
                      />
                    </span>
                    <div>
                      <strong>
                        {event.action in actionLabels
                          ? actionLabels[
                              event.action as keyof typeof actionLabels
                            ]
                          : readable(event.action)}
                      </strong>
                      <p>
                        {event.reply
                          ? "Reply saved · simulated delivery"
                          : event.actor === "seller"
                          ? "Seller decision recorded"
                          : "Recommendation prepared"}
                      </p>
                      <time dateTime={event.createdAt}>
                        {dateLabel(event.createdAt, true)}
                      </time>
                      {event.reply && (
                        <details className="audit-details">
                          <summary>Reply delivery & edits</summary>
                          <p>Source: {readable(event.reply.source)} · {event.reply.edited ? "Edited by seller" : "Unedited"}</p>
                          <p>Risk: {event.reply.risk} · {readable(event.reply.deliveryState)}</p>
                          <p>Confidence: {event.reply.confidence === null ? "Unavailable" : `${Math.round(event.reply.confidence * 100)}%`}</p>
                          <p>Sensitive-action approval: {event.reply.sellerApproved ? "Explicitly recorded" : event.reply.risk !== "high" ? "Not required" : "Not recorded"} · Simulated delivery</p>
                          {event.reply.originalDraft && <p>Original draft: {event.reply.originalDraft}</p>}
                          <p>Final reply: {event.reply.finalText}</p>
                        </details>
                      )}
                      {event.reasonCodes.length > 0 && (
                        <details className="audit-details">
                          <summary>View reasons</summary>
                          <ul>
                            {event.reasonCodes.map((reason, index) => (
                              <li key={`${reason}-${index}`}>
                                {readable(reason)}
                              </li>
                            ))}
                          </ul>
                          {event.evidenceIds.length > 0 && (
                            <p>
                              {event.evidenceIds.length} evidence{" "}
                              {event.evidenceIds.length === 1
                                ? "reference"
                                : "references"}
                            </p>
                          )}
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
