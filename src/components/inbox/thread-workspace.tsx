"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  SellerDecisionInput,
  SendReplyInput,
  ThreadDetailResponse,
} from "@/domain/contracts";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { errorMessage, RequestError, type InboxClient } from "./api";
import { ContextPanel, type ContextTab } from "./context-panel";
import {
  Avatar,
  dateLabel,
  EmptyState,
  LoadingState,
  Notice,
  PriorityBadge,
  readable,
  SentimentBadge,
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
  drafts: Record<string, { text: string; recommendationId?: string }>;
  onDraftChange: (key: string, draft: { text: string; recommendationId?: string }) => void;
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
  const composerId = useId();
  const [approved, setApproved] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const pendingReply = useRef<{ signature: string; requestId: string } | null>(null);
  const draftKey = `${sample ? "sample" : "api"}:${id}:reply`;
  const composer = drafts[draftKey] ?? { text: "" };
  const historyRef = useRef<HTMLDivElement>(null);
  const lastMessageId = state.status === "ready" ? state.detail.messages.at(-1)?.id : undefined;
  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [lastMessageId]);

  function viewAnalysis() {
    onContextTab("analysis");
    if (window.matchMedia("(max-width: 1199px)").matches) onContextOpen();
    else requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".desktop-context [role=tab][aria-selected=true]")?.focus());
  }

  function updateComposer(text: string, recommendationId = composer.recommendationId) {
    onDraftChange(draftKey, { text, recommendationId });
    setApproved(false);
    setSaveError(null);
  }

  async function sendReply(text: string, recommendationId?: string, mode: SendReplyInput["mode"] = "seller", sellerApproved = false) {
    if (busy.current || !text.trim()) return;
    busy.current = true;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    const payload = { text: text.trim(), recommendationId, mode, sellerApproved };
    const signature = JSON.stringify(payload);
    if (pendingReply.current?.signature !== signature) {
      pendingReply.current = { signature, requestId: crypto.randomUUID() };
    }
    try {
      const result = await client.reply(id, { ...payload, requestId: pendingReply.current.requestId });
      if (!mounted.current) return;
      pendingReply.current = null;
      setState((previous) => previous.status === "ready" ? {
        status: "ready",
        detail: {
          ...previous.detail,
          messages: [...previous.detail.messages.filter((message) => message.id !== result.message.id), result.message],
          audit: [...previous.detail.audit.filter((event) => event.id !== result.audit.id), result.audit],
          recommendation: result.recommendation ?? previous.detail.recommendation,
        },
      } : previous);
      if (composer.text.trim() === text.trim() && composer.recommendationId === recommendationId) {
        onDraftChange(draftKey, { text: "" });
      }
      setApproved(false);
      setApprovalRequired(false);
      setSuccess(sample ? "Sample reply added. It resets on reload." : "Reply saved to the conversation. Delivery is simulated; no marketplace message was sent.");
      onChanged();
      try {
        const refreshed = await client.thread(id);
        if (mounted.current) setState({ status: "ready", detail: refreshed });
      } catch {
        if (mounted.current) setSuccess("Reply saved. The latest conversation details could not be refreshed; reload to check them.");
      }
    } catch (error) {
      if (mounted.current) {
        setSaveError(errorMessage(error));
        if (error instanceof RequestError && error.code === "APPROVAL_REQUIRED") {
          onDraftChange(draftKey, { text, recommendationId });
          setApprovalRequired(true);
          setApproved(false);
          document.getElementById(composerId)?.focus();
        }
      }
    } finally {
      busy.current = false;
      if (mounted.current) setSaving(false);
    }
  }

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
        if (input.decision === "decline" && composer.recommendationId === result.recommendation.id) {
          onDraftChange(draftKey, { text: "" });
          setApproved(false);
        }
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
          input.decision === "decline"
            ? "Suggestion declined. You can write your own reply below."
            : "Seller decision recorded in the activity log. No external action was taken.",
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
  // An early approval affordance; the server checks both thread context and final text.
  const needsApproval = approvalRequired || recommendation?.deliveryState === "APPROVAL_REQUIRED" || recommendation?.risk === "high" ||
    /refund|cancel|payment|discount|compensat|guarantee|replace|reship|order_modification/i.test(thread.intent);
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
          <button className="button secondary analysis-toggle" onClick={viewAnalysis}><Icon name="info" size={16} />View analysis</button>
          <div className="thread-summary" aria-label="Buyer message summary">
            <PriorityBadge score={thread.priorityScore} />
            {thread.sentiment && <SentimentBadge sentiment={thread.sentiment} />}
            <span className="summary-intent" title={readable(thread.intent)}>{readable(thread.intent)}</span>
          </div>
        </header>
        <div className="thread-scroll" ref={historyRef} tabIndex={0} aria-label="Conversation history">
          <section
            className="conversation-section"
            aria-label="Message history"
          >
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
                          {dateLabel(message.createdAt, true)}
                        </time>
                      </div>
                    )}
                    <div className="message-bubble">
                      {message.role === "system" && (
                        <Icon name="info" size={15} />
                      )}
                      <p>{message.text}</p>
                    </div>
                    {message.delivery === "simulated" && <p className="message-meta">{sample ? "Sample simulated delivery · resets on reload" : "Simulated delivery · saved in Escala"}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div className="reply-dock">
          <div className="copilot-scroll">
          {generateError && <Notice variant="error">{generateError}</Notice>}
          {generating && (
            <Notice>
              Preparing the recommendation and checking its supporting evidence.
              You can keep reviewing the conversation.
            </Notice>
          )}
          {recommendation?.draft?.trim() && (!recommendation.status || recommendation.status === "pending") ? (
            <RecommendationPanel
              key={recommendation.id}
              recommendation={recommendation}
              onGenerate={generate}
              onEdit={() => {
                updateComposer(recommendation.draft ?? "", recommendation.id);
                document.getElementById(composerId)?.focus();
              }}
              onSend={(mode, sellerApproved) => sendReply(recommendation.draft ?? "", recommendation.id, mode, sellerApproved)}
              onDecline={() => { void decide({ decision: "decline" }); }}
              busy={generating || saving}
              sample={sample}
            />
          ) : (
            <div className="copilot-idle">
              <span><Icon name={recommendation?.status === "sent" ? "check" : "spark"} size={15} />{recommendation?.status === "sent" ? "Suggestion sent" : recommendation?.status === "declined" ? "Suggestion declined" : "Seller copilot"}</span>
              <button
                className="text-button"
                onClick={generate}
                disabled={generating || saving}
              >
                <Icon
                  name={generating ? "refresh" : "spark"}
                  className={generating ? "spin" : ""}
                  size={17}
                />
                {generating
                  ? "Preparing…"
                  : "Suggest a reply"}
              </button>
              {recommendation?.modelStatus === "fallback" && <details className="copilot-details"><summary>Drafting availability</summary><p>{recommendation.modelNotice || "Live OpenAI drafting is unavailable. You can write your own reply below."}</p></details>}
            </div>
          )}
          </div>
          <section className="reply-composer" aria-labelledby={`${composerId}-heading`}>
            <h3 className="sr-only" id={`${composerId}-heading`}>Reply to buyer</h3>
            <div className="draft-editor">
              <div className="editor-label">
                <label htmlFor={composerId}>{composer.recommendationId ? "Edit suggested reply" : "Your reply"}</label>
                {(composer.text || composer.recommendationId) && <button className="text-button" disabled={saving} onClick={() => {
                  onDraftChange(draftKey, { text: "" });
                  setApproved(false);
                  setSaveError(null);
                }}>Discard draft</button>}
              </div>
              <textarea id={composerId} value={composer.text} onChange={(event) => updateComposer(event.target.value)} rows={2} maxLength={2000} placeholder="Write a message…" disabled={saving} aria-describedby={`${composerId}-help`} onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (!saving && !generating && composer.text.trim() && (!needsApproval || approved)) void sendReply(composer.text, composer.recommendationId, "seller", approved);
                }
              }} />
            </div>
            {needsApproval && <label className="reply-approval"><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} disabled={saving} />I approve sending this reply about a sensitive action.</label>}
            {(saveError || success) && <div className="composer-feedback">{saveError ? <Notice variant="error">{saveError} Your reply is retained.</Notice> : <Notice variant="success">{success}</Notice>}</div>}
            <div className="composer-footer">
              <p id={`${composerId}-help`}><span>Enter for a new line · Ctrl/⌘ Enter to send</span><span>Simulated delivery · no order changes</span></p>
              <button className="button primary" disabled={saving || generating || !composer.text.trim() || (needsApproval && !approved)} onClick={() => sendReply(composer.text, composer.recommendationId, "seller", approved)}><Icon name="send" size={16} />{saving ? "Sending…" : needsApproval ? "Approve & send" : "Send"}</button>
            </div>
          </section>
        </div>
      </section>
      <aside className="desktop-context" aria-label="Analysis, evidence and activity">
        {context}
      </aside>
      <Drawer
        open={contextOpen}
        onClose={onContextClose}
        title="Conversation context"
      >
        {context}
      </Drawer>
    </div>
  );
}
