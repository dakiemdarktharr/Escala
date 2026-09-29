"use client";

import { useEffect, useId, useRef, useState } from "react";
import type {
  SellerDecisionInput,
  ConversationUpdateInput,
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
  conversationLabels,
} from "./presentation";
import { RecommendationPanel } from "./recommendation-panel";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: ThreadDetailResponse }
  | { status: "error"; error: string };

export interface ComposerDraft { text: string; recommendationId?: string; contextRevision?: number; seenRecommendationKey?: string }
type ApprovalSnapshot = { text: string; revision: number; recommendationId?: string };
const emptyComposer: ComposerDraft = { text: "" };

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
  drafts: Record<string, ComposerDraft>;
  onDraftChange: (key: string, draft: ComposerDraft) => void;
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
  const detailEpoch = useRef(0);
  const composerId = useId();
  const [approval, setApproval] = useState<ApprovalSnapshot | null>(null);
  const [desktopContext, setDesktopContext] = useState(true);
  const [writing, setWriting] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const pendingReply = useRef<{ signature: string; requestId: string } | null>(null);
  const draftKey = `${sample ? "sample" : "api"}:${id}:reply`;
  const composer = drafts[draftKey] ?? emptyComposer;
  const revision = state.status === "ready" ? state.detail.thread.contextRevision : undefined;
  const prepared = state.status === "ready" ? state.detail.recommendation : null;
  const conversationState = state.status === "ready" ? state.detail.thread.conversationState : undefined;
  const consumedDraft = Boolean(composer.text.trim() && composer.recommendationId && state.status === "ready" && (prepared?.id !== composer.recommendationId || prepared?.status !== "pending"));
  const approved = Boolean(!consumedDraft && approval && approval.text === composer.text.trim() && approval.revision === revision);
  const staleDraft = Boolean(composer.text.trim() && composer.contextRevision !== undefined && revision !== undefined && composer.contextRevision !== revision);
  const preparedKey = prepared ? `${prepared.id}:${prepared.contextRevision ?? revision}` : undefined;
  useEffect(() => {
    if (!preparedKey || composer.seenRecommendationKey === preparedKey || !prepared) return;
    const valid = !["WAITING_FOR_BUYER", "AUTO_HANDLED", "RESOLVED", "AWAITING_PROCESSING"].includes(conversationState ?? "") && prepared.status === "pending" && prepared.draft?.trim() && (prepared.contextRevision === undefined || prepared.contextRevision === revision);
    if (conversationState === "AWAITING_PROCESSING") return;
    onDraftChange(draftKey, !composer.text.trim() && valid
      ? { text: prepared.draft!, recommendationId: prepared.id, contextRevision: revision, seenRecommendationKey: preparedKey }
      : { ...composer, seenRecommendationKey: preparedKey });
  }, [preparedKey, prepared, composer, revision, draftKey, onDraftChange, conversationState]);
  const historyRef = useRef<HTMLDivElement>(null);
  const lastMessageId = state.status === "ready" ? state.detail.messages.at(-1)?.id : undefined;
  useEffect(() => {
    const history = historyRef.current;
    if (history) history.scrollTop = history.scrollHeight;
  }, [lastMessageId]);

  function viewAnalysis() {
    onContextTab("analysis");
    if (window.matchMedia("(max-width: 1199px)").matches) onContextOpen();
    else { setDesktopContext(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".desktop-context [role=tab][aria-selected=true]")?.focus()); }
  }

  function updateComposer(text: string, recommendationId = composer.recommendationId) {
    onDraftChange(draftKey, { ...composer, text, recommendationId, contextRevision: composer.contextRevision ?? revision });
    setApproval(null);
    setSaveError(null);
  }

  async function sendReply(text: string, recommendationId?: string, mode: SendReplyInput["mode"] = "seller", approvedSnapshot: ApprovalSnapshot | null = null) {
    if (busy.current || !text.trim() || revision === undefined || staleDraft || consumedDraft) return;
    busy.current = true;
    detailEpoch.current += 1;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    const payload = { text: text.trim(), recommendationId, mode, contextRevision: revision, sellerApproved: Boolean(approvedSnapshot), ...(approvedSnapshot ? { approvedText: approvedSnapshot.text, contextRevision: approvedSnapshot.revision } : {}) };
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
        onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
      }
      setApproval(null);
      setWriting(false);
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
          onDraftChange(draftKey, { ...composer, text, recommendationId, contextRevision: revision });
          setApprovalRequired(true);
          setApproval(null);
          document.getElementById(composerId)?.focus();
        }
        if (error instanceof RequestError && error.code === "STALE_CONTEXT") {
          setApproval(null);
          setSaveError("A new buyer message changed this conversation. Review the latest context before sending your retained draft.");
          setAttempt((value) => value + 1);
        }
        if (error instanceof RequestError && error.code === "STALE_RECOMMENDATION") {
          setApproval(null);
          setSaveError("This suggestion changed or was already sent. Refreshing the conversation; your draft is retained for review.");
          setAttempt((value) => value + 1);
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
    const load = (initial: boolean) => {
      const epoch = detailEpoch.current;
      return client
      .thread(id, controller.signal)
      .then((detail) => {
        if (!controller.signal.aborted && !busy.current && epoch === detailEpoch.current) {
          setState({ status: "ready", detail });
          setApproval((current) => current && (current.revision !== detail.thread.contextRevision || (current.recommendationId && (detail.recommendation?.id !== current.recommendationId || detail.recommendation?.status !== "pending"))) ? null : current);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (initial) setState({ status: "error", error: errorMessage(error) });
          else setSaveError(`Conversation refresh failed. ${errorMessage(error)}`);
        }
      });
    };
    void load(true);
    const timer = setInterval(() => { if (!busy.current) void load(false); }, 5000);
    return () => {
      mounted.current = false;
      controller.abort();
      clearInterval(timer);
    };
  }, [client, id, attempt]);

  async function generate() {
    if (busy.current || state.status !== "ready") return;
    busy.current = true;
    detailEpoch.current += 1;
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
    detailEpoch.current += 1;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    try {
      const result = await client.decide(state.detail.recommendation.id, input);
      if (mounted.current) {
        if (input.decision === "decline" && composer.recommendationId === result.recommendation.id) {
          onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
          setApproval(null);
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

  async function changeConversation(nextState: ConversationUpdateInput["state"]) {
    if (busy.current || revision === undefined) return;
    busy.current = true; detailEpoch.current += 1; setSaving(true); setSaveError(null);
    try {
      const detail = await client.updateConversation(id, { state: nextState, contextRevision: revision });
      if (mounted.current) { setState({ status: "ready", detail }); setApproval(null); onChanged(); }
    } catch (error) { if (mounted.current) setSaveError(errorMessage(error)); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
  }
  async function retryDelivery(attemptId: string) {
    if (busy.current) return;
    busy.current = true; detailEpoch.current += 1; setSaving(true); setSaveError(null);
    try {
      const result = await client.retryReply(id, attemptId);
      const detail = await client.thread(id);
      if (mounted.current) {
        setState({ status: "ready", detail });
        if (composer.text.trim() === result.message.text.trim()) onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
        setApproval(null); setSuccess("Reply delivered through simulated transport."); onChanged();
      }
    } catch (error) { if (mounted.current) setSaveError(errorMessage(error)); }
    finally { busy.current = false; if (mounted.current) setSaving(false); }
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
  const needsApproval = approvalRequired || thread.conversationState === "APPROVAL_REQUIRED" || recommendation?.deliveryState === "APPROVAL_REQUIRED";
  const handled = ["WAITING_FOR_BUYER", "AUTO_HANDLED", "RESOLVED"].includes(thread.conversationState ?? "");
  const canSend = !saving && !generating && Boolean(composer.text.trim()) && !staleDraft && !consumedDraft && revision !== undefined && (!needsApproval || approved);
  const context = (
    <ContextPanel
      detail={detail}
      tab={contextTab}
      onTabChange={onContextTab}
      sample={sample}
      onClose={() => setDesktopContext(false)}
    />
  );
  return (
    <div className={`thread-layout${desktopContext ? "" : " context-collapsed"}`}>
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
            {thread.conversationState && <span className={`conversation-status status-${thread.conversationState}`}>{conversationLabels[thread.conversationState]}</span>}
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
                            : message.sentBy === "escala" ? "Escala" : "Seller"}
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
                    {message.sentBy === "escala" && <p className="automatic-attribution"><Icon name="spark" size={11} />Sent automatically by Escala</p>}
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
          {!handled && recommendation?.draft?.trim() && recommendation.status === "pending" && (recommendation.contextRevision === undefined || recommendation.contextRevision === revision) ? (
            <RecommendationPanel
              key={recommendation.id}
              recommendation={recommendation}
              onGenerate={generate}
              onEdit={() => {
                onDraftChange(draftKey, { text: recommendation.draft ?? "", recommendationId: recommendation.id, contextRevision: revision, seenRecommendationKey: preparedKey });
                setApproval(null);
                document.getElementById(composerId)?.focus();
              }}
              onSend={(mode, sellerApproved) => sendReply(recommendation.draft ?? "", recommendation.id, mode, sellerApproved && revision !== undefined ? { text: recommendation.draft!.trim(), revision } : null)}
              onDecline={() => { void decide({ decision: "decline" }); }}
              busy={generating || saving || staleDraft || consumedDraft || revision === undefined}
              sample={sample}
            />
          ) : !handled ? (
            <div className="copilot-idle">
              <span><Icon name="shield" size={15} />{thread.conversationState === "AWAITING_PROCESSING" ? "Awaiting background processing" : recommendation?.status === "declined" ? "Draft discarded · write your own reply" : "Your review is needed"}</span>
              {thread.stateReasons?.length ? <p>{thread.stateReasons.map(readable).join(" · ")}</p> : null}
              {recommendation?.modelStatus === "fallback" && <details className="copilot-details"><summary>Drafting availability</summary><p>{recommendation.modelNotice || "Live OpenAI drafting is unavailable. You can write your own reply below."}</p></details>}
            </div>
          ) : null}
          {detail.deliveries?.filter((delivery) => delivery.state === "FAILED").map((delivery) => <div className="failed-delivery" key={delivery.id}><Icon name="alert" size={15} /><span>Send failed. {delivery.error}</span><button className="text-button" disabled={saving} onClick={() => { void retryDelivery(delivery.id); }}>Retry delivery</button></div>)}
          </div>
          {handled && !writing && !composer.text.trim() ? <div className="handled-summary"><Icon name="check" size={20} /><div><strong>{thread.conversationState === "RESOLVED" ? "Conversation resolved" : "All set. Waiting for the buyer."}</strong><p>{detail.messages.some((message) => message.sentBy === "escala") ? "Escala’s reply is in the conversation above." : "Your reply is in the conversation above."}</p></div><button className="text-button" onClick={() => setWriting(true)}>Write a follow-up</button></div> : <section className="reply-composer" aria-labelledby={`${composerId}-heading`}>
            <h3 className="sr-only" id={`${composerId}-heading`}>Reply to buyer</h3>
            <div className="draft-editor">
              <div className="editor-label">
                <label htmlFor={composerId}>{consumedDraft || staleDraft ? "Retained draft · review required" : composer.recommendationId ? "Escala suggested · ready for your review" : "Your reply"}</label>
                {(composer.text || composer.recommendationId) && <button className="text-button" disabled={saving} onClick={() => {
                  if (composer.recommendationId && recommendation?.status === "pending") void decide({ decision: "decline" });
                  onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
                  setApproval(null);
                  setSaveError(null);
                }}>Discard draft</button>}
              </div>
              <textarea id={composerId} value={composer.text} onChange={(event) => updateComposer(event.target.value)} rows={2} maxLength={2000} placeholder="Write a message…" disabled={saving} aria-describedby={`${composerId}-help`} onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  if (canSend) void sendReply(composer.text, composer.recommendationId, "seller", approved ? approval : null);
                }
              }} />
            </div>
            {staleDraft && <Notice variant="warning">A new buyer message changed the context. Your draft is retained. <button className="text-button" disabled={saving} onClick={() => { onDraftChange(draftKey, { ...composer, contextRevision: revision, recommendationId: undefined }); setApproval(null); setSaveError(null); }}>I reviewed the latest message</button></Notice>}
            {consumedDraft && !staleDraft && <Notice variant="warning">{prepared?.id === composer.recommendationId && prepared?.status === "sent" ? "This suggestion was already sent. Review the latest reply before sending a follow-up." : "This suggestion is no longer pending. Review the conversation before using your retained draft."} Your text is retained. <button className="text-button" disabled={saving} onClick={() => { onDraftChange(draftKey, { ...composer, contextRevision: revision, recommendationId: undefined }); setApproval(null); setSaveError(null); setWriting(true); }}>I reviewed this as a follow-up</button></Notice>}
            {revision === undefined && <Notice variant="warning">Conversation version unavailable. Refresh this conversation before sending.</Notice>}
            {needsApproval && <label className="reply-approval"><input type="checkbox" checked={approved} onChange={(event) => setApproval(event.target.checked && revision !== undefined ? { text: composer.text.trim(), revision, recommendationId: composer.recommendationId } : null)} disabled={saving || staleDraft || consumedDraft || !composer.text.trim()} />I approve this exact reply and its sensitive action.</label>}
            {(saveError || success) && <div className="composer-feedback">{saveError ? <Notice variant="error">{saveError} Your reply is retained.</Notice> : <Notice variant="success">{success}</Notice>}</div>}
            <div className="composer-footer">
              <p id={`${composerId}-help`}><span>Enter for a new line · Ctrl/⌘ Enter to send</span><span>Simulated delivery · no order changes</span></p>
              <button className="button primary" disabled={!canSend} onClick={() => sendReply(composer.text, composer.recommendationId, "seller", approved ? approval : null)}><Icon name="send" size={16} />{saving ? "Sending…" : needsApproval ? "Approve & send" : "Send reply"}</button>
            </div>
          </section>}
          {handled && !writing && !composer.text.trim() && (saveError || success) && <Notice variant={saveError ? "error" : "success"}>{saveError ?? success}</Notice>}
          <div className="conversation-actions"><button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("WAITING_FOR_SELLER_REVIEW"); }}>Mark manual</button><button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("ESCALATED"); }}>Escalate</button>{thread.conversationState !== "RESOLVED" && <button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("RESOLVED"); }}>Mark resolved</button>}</div>
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
