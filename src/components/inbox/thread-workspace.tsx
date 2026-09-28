"use client";

import { useEffect, useRef, useState } from "react";
import type {
  SellerDecisionInput,
  ThreadDetailResponse,
} from "@/domain/contracts";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { errorMessage, type InboxClient } from "./api";
import { ContextPanel, type ContextTab } from "./context-panel";
import {
  Avatar,
  dateLabel,
  EmptyState,
  LoadingState,
  Notice,
  TriageSignals,
} from "./presentation";
import { RecommendationPanel } from "./recommendation-panel";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: ThreadDetailResponse }
  | { status: "error"; error: string };

export function ThreadWorkspace({
  id,
  client,
  sample,
  contextTab,
  onContextTab,
  contextOpen,
  onContextClose,
  onContextOpen,
  onQueueOpen,
  drafts,
  onDraftChange,
  onChanged,
}: {
  id: string;
  client: InboxClient;
  sample: boolean;
  contextTab: ContextTab;
  onContextTab: (tab: ContextTab) => void;
  contextOpen: boolean;
  onContextClose: () => void;
  onContextOpen: () => void;
  onQueueOpen: () => void;
  drafts: Record<string, string>;
  onDraftChange: (key: string, text: string) => void;
  onChanged: () => void;
}) {
  const [state, setState] = useState<DetailState>({ status: "loading" });
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  const busy = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    client
      .thread(id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted) setState({ status: "ready", detail });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: "error", error: errorMessage(error) });
      });
    return () => {
      mounted.current = false;
      controller.abort();
    };
  }, [client, id, attempt]);

  async function generate() {
    if (busy.current || state.status !== "ready") return;
    busy.current = true;
    setGenerating(true);
    setGenerateError(null);
    setSuccess(null);
    setSaveError(null);
    try {
      const result = await client.recommend(id);
      if (mounted.current)
        setState((previous) =>
          previous.status === "ready"
            ? {
                status: "ready",
                detail: {
                  ...previous.detail,
                  recommendation: result.recommendation,
                  evidence: result.recommendation.evidence,
                  audit: [
                    ...previous.detail.audit.filter(
                      (event) => event.id !== result.audit.id,
                    ),
                    result.audit,
                  ],
                },
              }
            : previous,
        );
      if (mounted.current) onChanged();
    } catch (error) {
      if (mounted.current) setGenerateError(errorMessage(error));
    } finally {
      busy.current = false;
      if (mounted.current) setGenerating(false);
    }
  }

  async function decide(input: SellerDecisionInput) {
    if (
      busy.current ||
      state.status !== "ready" ||
      !state.detail.recommendation
    )
      return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const result = await client.decide(state.detail.recommendation.id, input);
      if (mounted.current) {
        setState((previous) =>
          previous.status === "ready"
            ? {
                status: "ready",
                detail: {
                  ...previous.detail,
                  recommendation: result.recommendation,
                  audit: [
                    ...previous.detail.audit.filter(
                      (event) => event.id !== result.audit.id,
                    ),
                    result.audit,
                  ],
                },
              }
            : previous,
        );
        setSuccess(
          input.decision === "escalate"
            ? "Escalation recorded in the activity log. No external action was taken."
            : input.decision === "ask_clarification"
              ? "Clarification recorded in the activity log. No message was sent."
              : input.decision === "edit"
                ? "Reviewed draft recorded in the activity log. No message was sent."
                : "Approval recorded in the activity log. No message was sent.",
        );
      }
      if (mounted.current) onChanged();
    } catch (error) {
      if (mounted.current) setSaveError(errorMessage(error));
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

  if (state.status === "loading")
    return (
      <div className="thread-loading">
        <div className="mobile-detail-tools">
          <button className="text-button" onClick={onQueueOpen}>
            <Icon name="arrow" size={16} />
            Conversations
          </button>
        </div>
        <LoadingState />
        <p>Opening conversation and evidence…</p>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="thread-error">
        <div className="mobile-detail-tools">
          <button className="text-button" onClick={onQueueOpen}>
            <Icon name="arrow" size={16} />
            Conversations
          </button>
        </div>
        <EmptyState
          icon="alert"
          title="Conversation unavailable"
          action={
            <button
              className="button secondary"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          }
        >
          {state.error}
        </EmptyState>
      </div>
    );

  const { detail } = state;
  const { thread, recommendation } = detail;
  const draftKey = `${sample ? "sample" : "api"}:${recommendation?.id ?? id}`;
  const context = (
    <ContextPanel
      detail={detail}
      tab={contextTab}
      onTabChange={onContextTab}
      sample={sample}
    />
  );
  return (
    <div className="thread-layout">
      <section className="thread-main" aria-labelledby="thread-title">
        <header className="thread-header">
          <button
            className="icon-button mobile-queue-toggle"
            onClick={onQueueOpen}
            aria-label="Open conversations"
          >
            <Icon name="arrow" />
          </button>
          <Avatar name={thread.buyerName} />
          <div className="thread-identity">
            <h2 id="thread-title">{thread.buyerName}</h2>
            <span>
              {thread.orderId
                ? `Order #${thread.orderId}`
                : "Buyer conversation"}
              <span className="identity-divider" aria-hidden="true" />
              Synthetic inbox
            </span>
          </div>
          <button
            className="icon-button context-toggle"
            onClick={onContextOpen}
            aria-label="Open evidence and activity"
          >
            <Icon name="book" />
          </button>
          <span className="desktop-thread-meta">
            <Icon name="shield" size={15} />
            Seller workspace
          </span>
        </header>
        <div className="thread-scroll">
          <TriageSignals thread={thread} sample={sample} />
          <section
            className="conversation-section"
            aria-label="Message history"
          >
            <div className="conversation-date">
              <span>{dateLabel(thread.updatedAt, true)}</span>
            </div>
            {detail.messages.length === 0 ? (
              <EmptyState title="No messages in this thread">
                Refresh the inbox to check for new conversation content.
              </EmptyState>
            ) : (
              <ol className="message-list">
                {detail.messages.map((message) => (
                  <li
                    key={message.id}
                    className={`message message-${message.role}`}
                  >
                    {message.role !== "system" && (
                      <div className="message-meta">
                        <span>
                          {message.role === "buyer"
                            ? thread.buyerName
                            : "Seller"}
                        </span>
                        <time dateTime={message.createdAt}>
                          {dateLabel(message.createdAt)}
                        </time>
                      </div>
                    )}
                    <div className="message-bubble">
                      {message.role === "system" && (
                        <Icon name="info" size={15} />
                      )}
                      <p>{message.text}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <div className="review-divider">
            <Icon name="spark" size={15} />
            <span>From conversation to next step</span>
          </div>
          {generateError && <Notice variant="error">{generateError}</Notice>}
          {generating && (
            <Notice>
              Preparing the recommendation and checking its supporting evidence.
              You can keep reviewing the conversation.
            </Notice>
          )}
          {recommendation ? (
            <RecommendationPanel
              key={recommendation.id}
              recommendation={recommendation}
              draft={drafts[draftKey] ?? recommendation.draft ?? ""}
              onDraftChange={(text) => onDraftChange(draftKey, text)}
              onGenerate={generate}
              onDecision={decide}
              generating={generating}
              saving={saving}
              saveError={saveError}
              success={success}
              sample={sample}
            />
          ) : (
            <div className="recommendation-start">
              <span className="recommendation-symbol">
                <Icon name="spark" size={24} />
              </span>
              <h3>A considered next step.</h3>
              <p>
                Prepare a recommendation using this conversation and the
                seller’s knowledge. You’ll see its reasons before making a
                decision.
              </p>
              <button
                className="button primary"
                onClick={generate}
                disabled={generating}
              >
                <Icon
                  name={generating ? "refresh" : "spark"}
                  className={generating ? "spin" : ""}
                  size={17}
                />
                {generating
                  ? "Preparing recommendation…"
                  : "Prepare recommendation"}
              </button>
              <p className="no-send-note">No buyer message will be sent.</p>
            </div>
          )}
          <p className="thread-bottom-note">
            <Icon name="shield" size={14} />
            Your judgment, backed by evidence.
          </p>
        </div>
      </section>
      <aside className="desktop-context" aria-label="Evidence and activity">
        {context}
      </aside>
      <Drawer
        open={contextOpen}
        onClose={onContextClose}
        title="Evidence & activity"
      >
        {context}
      </Drawer>
    </div>
  );
}
