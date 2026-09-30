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
  conversationLabel,
  requestLabel,
  requestSummary,
} from "./presentation";
import { RecommendationPanel } from "./recommendation-panel";

type DetailState =
  | { status: "loading" }
  | { status: "ready"; detail: ThreadDetailResponse }
  | { status: "error"; error: string };

export interface ComposerDraft {
  text: string;
  recommendationId?: string;
  contextRevision?: number;
  seenRecommendationKey?: string;
  pendingReply?: { signature: string; requestId: string };
}
type ApprovalSnapshot = { text: string; revision: number; recommendationId?: string; context: string };
const emptyComposer: ComposerDraft = { text: "" };

// Bind the confirmation to the context the seller actually saw, including policy and evidence.
function approvalContext(detail: ThreadDetailResponse) {
  const { thread } = detail;
  return JSON.stringify([thread.contextRevision, thread.currentBuyerMessageId, thread.conversationState,
    thread.intent, thread.stateReasons, thread.autonomyDecision, detail.recommendation, detail.order, detail.evidence]);
}

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
  const [desktopContext, setDesktopContext] = useState(false);
  const [writing, setWriting] = useState(false);
  const [approvalRequired, setApprovalRequired] = useState(false);
  const draftKey = `${sample ? "sample" : "api"}:${id}:reply`;
  const composer = drafts[draftKey] ?? emptyComposer;
  const revision = state.status === "ready" ? state.detail.thread.contextRevision : undefined;
  const prepared = state.status === "ready" ? state.detail.recommendation : null;
  const conversationState = state.status === "ready" ? state.detail.thread.conversationState : undefined;
  const consumedDraft = Boolean(composer.text.trim() && composer.recommendationId && state.status === "ready" && (prepared?.id !== composer.recommendationId || prepared?.status !== "pending"));
  const currentContext = state.status === "ready" ? approvalContext(state.detail) : "";
  const approved = Boolean(!consumedDraft && approval && approval.text === composer.text.trim() && approval.revision === revision && approval.recommendationId === composer.recommendationId && approval.context === currentContext);
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
    if (approvedSnapshot && (approvedSnapshot.text !== text.trim() || approvedSnapshot.revision !== revision || approvedSnapshot.recommendationId !== recommendationId || approvedSnapshot.context !== currentContext)) {
      setApproval(null);
      setSaveError("Nội dung trả lời hoặc hội thoại đã thay đổi. Hãy kiểm tra lại trước khi gửi mô phỏng.");
      return;
    }
    busy.current = true;
    detailEpoch.current += 1;
    setSaving(true);
    setSaveError(null);
    setSuccess(null);
    const payload = { text: text.trim(), recommendationId, mode, contextRevision: revision, sellerApproved: Boolean(approvedSnapshot), ...(approvedSnapshot ? { approvedText: approvedSnapshot.text, contextRevision: approvedSnapshot.revision } : {}) };
    const signature = JSON.stringify(payload);
    // Keep the attempt in InboxWorkspace's per-thread draft state so navigation
    // after a timeout cannot assign a new id to the same retry payload.
    const pendingReply = composer.pendingReply?.signature === signature
      ? composer.pendingReply
      : { signature, requestId: crypto.randomUUID() };
    onDraftChange(draftKey, { ...composer, pendingReply });
    try {
      const result = await client.reply(id, { ...payload, requestId: pendingReply.requestId });
      if (!mounted.current) return;
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
      setSuccess(sample ? "Đã gửi mô phỏng trong phiên xem thử; tải lại sẽ mất." : "Đã lưu câu trả lời trong hội thoại demo và gửi mô phỏng. Chưa gửi đến sàn.");
      onChanged();
      try {
        const refreshed = await client.thread(id);
        if (mounted.current) setState({ status: "ready", detail: refreshed });
      } catch {
        if (mounted.current) setSuccess("Đã lưu câu trả lời trong hội thoại demo. Chưa tải lại được chi tiết; hãy làm mới để kiểm tra.");
      }
    } catch (error) {
      if (mounted.current) {
        setSaveError(errorMessage(error));
        if (error instanceof RequestError && error.code === "APPROVAL_REQUIRED") {
          onDraftChange(draftKey, { ...composer, text, recommendationId, contextRevision: revision, pendingReply });
          setApprovalRequired(true);
          setApproval(null);
          setSaveError("Câu trả lời này cần bạn phê duyệt. Kiểm tra nội dung rồi chọn Duyệt và gửi mô phỏng.");
          document.getElementById(composerId)?.focus();
        }
        if (error instanceof RequestError && error.code === "STALE_CONTEXT") {
          setApproval(null);
          setSaveError("Có tin nhắn mới làm thay đổi ngữ cảnh. Kiểm tra hội thoại mới nhất trước khi dùng bản nháp đã giữ lại.");
          setAttempt((value) => value + 1);
        }
        if (error instanceof RequestError && error.code === "STALE_RECOMMENDATION") {
          setApproval(null);
          setSaveError("Đề xuất đã thay đổi hoặc đã gửi mô phỏng. Đang tải lại hội thoại; bản nháp được giữ để bạn kiểm tra.");
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
          setApproval((current) => current && (current.context !== approvalContext(detail) || current.revision !== detail.thread.contextRevision || (current.recommendationId && (detail.recommendation?.id !== current.recommendationId || detail.recommendation?.status !== "pending"))) ? null : current);
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          if (initial) setState({ status: "error", error: errorMessage(error) });
          else setSaveError(`Chưa làm mới được hội thoại. ${errorMessage(error)}`);
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
    setApproval(null);
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
          setWriting(true);
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
            ? "Đã bỏ đề xuất. Bạn có thể tự soạn câu trả lời bên dưới."
            : "Đã ghi nhận quyết định vào nhật ký. Chưa thực hiện thao tác trên sàn.",
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
      if (!mounted.current) return;
      setState((previous) => previous.status === "ready" ? {
        status: "ready", detail: {
          ...previous.detail,
          messages: [...previous.detail.messages.filter((message) => message.id !== result.message.id), result.message],
          audit: [...previous.detail.audit.filter((event) => event.id !== result.audit.id), result.audit],
          recommendation: result.recommendation ?? previous.detail.recommendation,
          deliveries: previous.detail.deliveries?.filter((delivery) => delivery.id !== attemptId),
        },
      } : previous);
      if (composer.text.trim() === result.message.text.trim()) onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
      setApproval(null);
      setSuccess(sample ? "Đã gửi mô phỏng trong phiên xem thử; tải lại sẽ mất." : "Đã lưu câu trả lời trong hội thoại demo và gửi mô phỏng. Chưa gửi đến sàn.");
      onChanged();
      try {
        const detail = await client.thread(id);
        if (mounted.current) setState({ status: "ready", detail });
      } catch {
        if (mounted.current) setSuccess("Đã gửi mô phỏng và lưu trong hội thoại demo. Chưa làm mới được chi tiết; hãy tải lại để xem trạng thái mới nhất.");
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
            Hội thoại
          </button>
        </div>
        <LoadingState />
        <p>Đang mở hội thoại và nguồn tham chiếu…</p>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="thread-error">
        <div className="mobile-detail-tools">
          <button className="text-button" onClick={onQueueOpen}>
            <Icon name="arrow" size={16} />
            Hội thoại
          </button>
        </div>
        <EmptyState
          icon="alert"
          title="Chưa tải được hội thoại"
          action={
            <button
              className="button secondary"
              onClick={() => {
                setState({ status: "loading" });
                setAttempt((value) => value + 1);
              }}
            >
              Thử lại
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
  const canSend = !saving && !generating && Boolean(composer.text.trim()) && !staleDraft && !consumedDraft && revision !== undefined;
  const uncertain = thread.intent === "unknown" || recommendation?.deliveryState === "MANUAL_ONLY";
  const showComposer = writing || (!handled && !uncertain) || staleDraft || consumedDraft || (handled && Boolean(composer.text.trim()));
  const editing = writing || !composer.recommendationId || staleDraft || consumedDraft;
  const latestReply = detail.messages.findLast((message) => message.role === "seller");
  function requestSend() {
    if (!canSend || busy.current || revision === undefined) return;
    if (needsApproval) {
      setApproval({ text: composer.text.trim(), revision, recommendationId: composer.recommendationId, context: currentContext });
    } else {
      void sendReply(composer.text, composer.recommendationId);
    }
  }
  function editReply() {
    setWriting(true);
    setApproval(null);
    requestAnimationFrame(() => document.getElementById(composerId)?.focus());
  }
  const context = (
    <ContextPanel
      detail={detail}
      tab={contextTab}
      onTabChange={onContextTab}
      sample={sample}
      onClose={() => { setDesktopContext(false); onContextClose(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".analysis-toggle")?.focus()); }}
    />
  );
  return (
    <div className={`thread-layout${desktopContext ? "" : " context-collapsed"}`}>
      <section className="thread-main" aria-labelledby="thread-title">
        <header className="thread-header">
          <button
            className="icon-button mobile-queue-toggle"
            onClick={onQueueOpen}
            aria-label="Mở danh sách hội thoại"
          >
            <Icon name="arrow" />
          </button>
          <Avatar name={thread.buyerName} />
          <div className="thread-identity">
            <h2 id="thread-title">{thread.buyerName}</h2>
            <span><span className={`conversation-status status-${thread.conversationState ?? "unknown"}`}>{conversationLabel(thread)}</span><span className="identity-divider" aria-hidden="true" />{requestLabel(thread.intent)}</span>
          </div>
          <button className="text-button analysis-toggle" aria-expanded={desktopContext || contextOpen} onClick={viewAnalysis}><Icon name="info" size={16} />Vì sao Escala gợi ý?</button>
        </header>
        <div className="thread-scroll" ref={historyRef} tabIndex={0} aria-label="Lịch sử hội thoại">
          <section
            className="conversation-section"
            aria-label="Lịch sử tin nhắn"
          >
            {detail.messages.length === 0 ? (
              <EmptyState title="Hội thoại chưa có tin nhắn">
                Làm mới hộp thư để kiểm tra tin nhắn mới.
              </EmptyState>
            ) : (
              <ol className="message-list">
                {detail.messages.map((message) => (
                  <li
                    key={message.id}
                    id={`message-${message.id}`}
                    tabIndex={-1}
                    className={`message message-${message.role}`}
                  >
                    {message.role !== "system" && (
                      <div className="message-meta">
                        <span>
                          {message.role === "buyer"
                            ? thread.buyerName
                            : message.sentBy === "escala" ? "Escala" : "Người bán"}
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
                    {message.role === "seller" && <p className="automatic-attribution"><Icon name={message.sentBy === "escala" ? "spark" : "check"} size={11} />{message.sentBy === "escala" ? "Escala tự động · " : "Người bán · "}{sample ? "mô phỏng trong phiên xem thử" : "đã gửi mô phỏng"}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
        <div className="reply-dock">
          <p className="simulation-note"><Icon name="shield" size={13} />{sample ? "Xem thử · chỉ lưu trong phiên, tải lại sẽ mất." : "Demo · lưu câu trả lời trong hội thoại; chỉ gửi mô phỏng, chưa gửi đến sàn."}</p>
          {generateError && <Notice variant="error">{generateError}</Notice>}
          {generating && <Notice>Đang chuẩn bị bản nháp…</Notice>}
          {!handled && !(writing && !composer.recommendationId) && (uncertain || thread.conversationState === "AWAITING_PROCESSING" || Boolean(composer.recommendationId && composer.text)) && <RecommendationPanel intent={thread.intent} needsApproval={needsApproval} uncertain={uncertain} processing={thread.conversationState === "AWAITING_PROCESSING"} />}
          {detail.deliveries?.filter((delivery) => delivery.state === "FAILED").map((delivery) => <div className="failed-delivery" key={delivery.id}><Icon name="alert" size={15} /><span>Chưa gửi mô phỏng được câu trả lời.</span><button className="text-button" disabled={saving} onClick={() => { void retryDelivery(delivery.id); }}>Thử gửi mô phỏng lại</button></div>)}
          {handled && !showComposer ? <div className="handled-summary"><Icon name="check" size={20} /><div><strong>{thread.conversationState === "RESOLVED" ? "Đã kết thúc hội thoại" : latestReply?.sentBy === "escala" ? "Escala đã trả lời tự động · mô phỏng" : "Đã gửi mô phỏng · chờ khách phản hồi"}</strong><p>{requestSummary(thread.intent)} {latestReply ? "Câu trả lời được lưu trong hội thoại; chưa gửi đến sàn." : "Chưa ghi nhận câu trả lời."}</p></div>{latestReply && <button className="text-button" onClick={() => { const message = document.getElementById(`message-${latestReply.id}`); message?.scrollIntoView({ block: "nearest", behavior: "smooth" }); message?.focus({ preventScroll: true }); }}>Xem câu trả lời</button>}</div> : showComposer ? <section className="reply-composer" aria-labelledby={`${composerId}-heading`}>
            <h3 className="sr-only" id={`${composerId}-heading`}>Soạn câu trả lời cho khách</h3>
            <div className={`draft-editor${editing ? " is-editing" : ""}`}>
              <div className="editor-label">
                <label htmlFor={editing ? composerId : undefined}>{consumedDraft || staleDraft ? "Bản nháp giữ lại · cần kiểm tra" : composer.recommendationId ? "Bản nháp đề xuất · chưa gửi" : "Bản nháp của bạn · chưa gửi"}</label>
                {!editing && <button className="text-button" disabled={saving} onClick={editReply}>Sửa</button>}
              </div>
              {editing ? <textarea id={composerId} value={composer.text} onChange={(event) => updateComposer(event.target.value)} rows={3} maxLength={2000} placeholder="Nhập nội dung trả lời…" disabled={saving} aria-describedby={`${composerId}-help`} onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  requestSend();
                }
              }} /> : <p className="suggested-reply">{composer.text}</p>}
            </div>
            {staleDraft && <Notice variant="warning">Tin nhắn mới làm thay đổi ngữ cảnh. Bản nháp vẫn được giữ. <button className="text-button" disabled={saving} onClick={() => { onDraftChange(draftKey, { ...composer, contextRevision: revision, recommendationId: undefined }); setApproval(null); setSaveError(null); }}>Tôi đã đọc tin nhắn mới nhất</button></Notice>}
            {consumedDraft && !staleDraft && <Notice variant="warning">{prepared?.id === composer.recommendationId && prepared?.status === "sent" ? "Đề xuất này đã gửi mô phỏng. Kiểm tra câu trả lời gần nhất trước khi viết tiếp." : "Đề xuất không còn hiệu lực. Kiểm tra hội thoại trước khi dùng bản nháp giữ lại."} <button className="text-button" disabled={saving} onClick={() => { onDraftChange(draftKey, { ...composer, contextRevision: revision, recommendationId: undefined }); setApproval(null); setSaveError(null); setWriting(true); }}>Tôi đã kiểm tra đây là tin nhắn tiếp theo</button></Notice>}
            {revision === undefined && <Notice variant="warning">Làm mới hội thoại trước khi gửi mô phỏng.</Notice>}
            {(saveError || success) && <div className="composer-feedback">{saveError ? <Notice variant="error">{saveError} Nội dung bạn soạn vẫn được giữ.</Notice> : <Notice variant="success">{success}</Notice>}</div>}
            <div className="composer-footer">
              <p id={`${composerId}-help`}>{needsApproval ? "Kiểm tra và phê duyệt nội dung trước khi gửi mô phỏng." : editing ? "Ctrl/⌘ Enter để gửi mô phỏng" : "Kiểm tra nội dung trước khi gửi mô phỏng."}</p>
              <button className="button primary" disabled={!canSend} onClick={requestSend}><Icon name="send" size={16} />{saving ? "Đang gửi mô phỏng…" : needsApproval ? "Duyệt và gửi mô phỏng" : "Gửi mô phỏng"}</button>
            </div>
          </section> : !handled && <div className="manual-reply-action"><button className="button primary" disabled={saving} onClick={() => { onDraftChange(draftKey, { text: "", contextRevision: revision, seenRecommendationKey: composer.seenRecommendationKey }); editReply(); }}>Tự soạn câu trả lời</button><button className="text-button" onClick={viewAnalysis}>Vì sao Escala gợi ý?</button></div>}
          {!showComposer && (saveError || success) && <Notice variant={saveError ? "error" : "success"}>{saveError ?? success}</Notice>}
          <details className="conversation-options">
            <summary>Thao tác khác</summary>
            <div className="conversation-actions">
              {handled && !showComposer && <button className="text-button" onClick={editReply}>Viết tin nhắn tiếp theo</button>}
              {!handled && <button className="text-button" disabled={saving || generating} onClick={() => { void generate(); }}>Chuẩn bị bản nháp khác</button>}
              {(composer.text || composer.recommendationId) && <button className="text-button" disabled={saving} onClick={() => {
                if (busy.current) return;
                if (composer.recommendationId && recommendation?.status === "pending") {
                  void decide({ decision: "decline" });
                  return;
                }
                onDraftChange(draftKey, { text: "", seenRecommendationKey: composer.seenRecommendationKey });
                setApproval(null); setSaveError(null); setWriting(true);
              }}>Bỏ bản nháp</button>}
              <button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("WAITING_FOR_SELLER_REVIEW"); }}>Chuyển sang tự xử lý</button>
              <button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("ESCALATED"); }}>Chuyển người phụ trách</button>
              {thread.conversationState !== "RESOLVED" && <button className="text-button" disabled={saving || revision === undefined} onClick={() => { void changeConversation("RESOLVED"); }}>Đánh dấu đã kết thúc</button>}
            </div>
          </details>
        </div>
      </section>
      <aside className="desktop-context" aria-label="Phân tích, nguồn tham chiếu và hoạt động">
        {context}
      </aside>
      <Drawer open={Boolean(approval && approved)} onClose={() => setApproval(null)} title={thread.intent === "cancellation" ? "Xác nhận câu trả lời về hủy đơn" : "Xác nhận câu trả lời nhạy cảm"} side="center">
        {approval && <div className="approval-confirmation">
          <p>Tin nhắn đề cập yêu cầu nhạy cảm. Chỉ gửi mô phỏng; không tự thay đổi đơn hàng.</p>
          <div className="confirmation-reply"><span>Trả lời {thread.buyerName}</span><p>{approval.text}</p></div>
          <p className="confirmation-context">Phê duyệt chỉ áp dụng cho đúng nội dung và ngữ cảnh hội thoại bạn vừa kiểm tra.</p>
          <div className="confirmation-actions"><button className="button secondary" onClick={() => setApproval(null)}>Hủy</button><button className="button primary" disabled={!approved || !canSend} onClick={() => { if (approved && canSend) { const snapshot = approval; setApproval(null); void sendReply(snapshot.text, snapshot.recommendationId, "seller", snapshot); } }}>Xác nhận và gửi mô phỏng</button></div>
        </div>}
      </Drawer>
      <Drawer
        open={contextOpen}
        onClose={onContextClose}
        title="Phân tích hội thoại"
      >
        {context}
      </Drawer>
    </div>
  );
}
