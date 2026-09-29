import type {
  InboxThreadSummary,
  RecommendationAction,
  RiskLevel,
  SentimentAnalysis,
} from "@/domain/contracts";
import { Icon, type IconName } from "@/components/ui/icon";

export const actionLabels: Record<RecommendationAction, string> = {
  AUTO_REPLY: "Routine reply",
  DRAFT_FOR_SELLER: "Seller review",
  ASK_CLARIFICATION: "Ask for details",
  ESCALATE: "Escalate to a person",
};

export const conversationLabels = {
  AWAITING_PROCESSING: "Needs reply",
  AUTO_HANDLED: "Handled",
  WAITING_FOR_BUYER: "Waiting for customer",
  WAITING_FOR_SELLER_REVIEW: "Needs reply",
  APPROVAL_REQUIRED: "Needs approval",
  RESOLVED: "Handled",
  ESCALATED: "Needs reply",
  SEND_FAILED: "Needs reply",
};
export function conversationLabel(thread: InboxThreadSummary) {
  return thread.conversationState ? conversationLabels[thread.conversationState] : "Needs reply";
}
export function requestLabel(intent: string) {
  const labels: Record<string, string> = {
    refund: "Refund", payment_dispute_and_refund: "Payment issue", cancellation: "Cancellation",
    wrong_item: "Wrong item", damaged_item: "Damaged item", order_status: "Order status",
    delivery_complaint: "Delivery issue", return_or_exchange: "Return or exchange",
    positive_feedback: "Feedback", product_information: "Product question", stock_check: "Availability",
    product_and_shipping_faq: "Product and delivery", unknown: "Customer request",
  };
  return labels[intent] ?? "Customer request";
}
export function requestSummary(intent: string) {
  const summaries: Record<string, string> = {
    refund: "The customer is asking about a refund.",
    payment_dispute_and_refund: "The customer needs help with a payment issue.",
    cancellation: "The customer wants to cancel the order.",
    wrong_item: "The customer says they received the wrong item.",
    damaged_item: "The customer says the item arrived damaged.",
    order_status: "The customer wants an update on their order.",
    delivery_complaint: "The customer needs help with a delivery.",
    return_or_exchange: "The customer is asking about a return or exchange.",
    positive_feedback: "The customer shared feedback on their purchase.",
    product_information: "The customer has a product question.",
    stock_check: "The customer wants to check availability.",
    product_and_shipping_faq: "The customer is asking about product and delivery details.",
  };
  return summaries[intent] ?? "Review the customer’s message before replying.";
}
export function needsSeller(thread: InboxThreadSummary) {
  return thread.conversationState
    ? ["AWAITING_PROCESSING", "WAITING_FOR_SELLER_REVIEW", "APPROVAL_REQUIRED", "ESCALATED", "SEND_FAILED"].includes(thread.conversationState)
    : thread.requiresAction === true;
}
export function autoHandled(thread: InboxThreadSummary) {
  return ["AUTO_HANDLED", "WAITING_FOR_BUYER", "RESOLVED"].includes(thread.conversationState ?? "");
}

export function readable(value: string) {
  if (!value.includes("_") && !/^[A-Z\d :]+$/.test(value)) return value;
  const text = value.replaceAll("_", " ").replaceAll(":", ": ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dateLabel(value: string, includeDate = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Time unavailable";
  return new Intl.DateTimeFormat("en", {
    ...(includeDate ? { day: "numeric", month: "short" } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function Avatar({
  name,
  small = false,
}: {
  name: string;
  small?: boolean;
}) {
  return (
    <span
      className={`avatar${small ? " avatar-small" : ""}`}
      aria-hidden="true"
    >
      {name
        .trim()
        .split(/\s+/)
        .map((part) => Array.from(part)[0])
        .slice(-2)
        .join("") || "?"}
    </span>
  );
}

export function LevelBadge({
  level,
  kind,
}: {
  level: RiskLevel;
  kind: "risk" | "urgency";
}) {
  return (
    <span className={`badge level-${level} badge-${kind}`}>
      <Icon name={kind === "risk" ? "shield" : "clock"} size={12} />
      {level.charAt(0).toUpperCase() + level.slice(1)} {kind}
    </span>
  );
}

export function EmptyState({
  icon = "inbox",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Icon name={icon} size={28} />
      </span>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Notice({
  children,
  variant = "info",
}: {
  children: React.ReactNode;
  variant?: "info" | "error" | "success" | "warning";
}) {
  return (
    <div
      className={`notice notice-${variant}`}
      role={variant === "error" ? "alert" : "status"}
    >
      <Icon
        name={
          variant === "success"
            ? "check"
            : variant === "error" || variant === "warning"
              ? "alert"
              : "info"
        }
        size={16}
      />
      <div>{children}</div>
    </div>
  );
}

export function LoadingState({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`loading-state${compact ? " loading-compact" : ""}`}
      role="status"
    >
      <span className="sr-only">Loading conversations…</span>
      {[0, 1, 2, ...(compact ? [] : [3, 4])].map((item) => (
        <div className="skeleton-row" key={item} aria-hidden="true">
          <span className="skeleton skeleton-avatar" />
          <div>
            <span className="skeleton skeleton-title" />
            <span className="skeleton skeleton-line" />
            <span className="skeleton skeleton-short" />
          </div>
        </div>
      ))}
    </div>
  );
}

const sentimentSources: Record<SentimentAnalysis["source"], string> = {
  local_english_model: "Local English model",
  vietnamese_rules: "Vietnamese rules",
  unavailable: "Unavailable",
};
const languageLabels: Record<SentimentAnalysis["language"], string> = {
  unknown: "Awaiting analysis",
  english: "English",
  vietnamese: "Vietnamese",
  mixed: "Mixed language",
};

export function PriorityBadge({ score }: { score?: number }) {
  return (
    <span className="badge priority-score">
      Priority{" "}
      {score !== undefined && Number.isFinite(score) ? score : "unavailable"}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: SentimentAnalysis }) {
  return (
    <span className={`badge sentiment-${sentiment.label}`}>
      {sentiment.label === "unknown"
        ? "Sentiment unknown"
        : `${readable(sentiment.label.toUpperCase())} sentiment`}
    </span>
  );
}

export function TriageSignals({
  thread,
  sample,
}: {
  thread: InboxThreadSummary;
  sample: boolean;
}) {
  const { sentiment } = thread;
  const confidence = sentiment?.confidence;
  const hasConfidence =
    sentiment &&
    sentiment.source !== "unavailable" &&
    confidence != null &&
    Number.isFinite(confidence);

  return (
    <section className="triage-signals" aria-label="Conversation triage signals">
      <div className="triage-summary">
        <PriorityBadge score={thread.priorityScore} />
        <LevelBadge level={thread.urgency} kind="urgency" />
        {sentiment && <SentimentBadge sentiment={sentiment} />}
        {thread.requiresAction !== undefined && (
          <span className="badge action-needed">
            {thread.requiresAction ? "Needs action" : "No action flagged"}
          </span>
        )}
      </div>
      <details className="priority-details" open>
        <summary>Priority, urgency & sentiment details</summary>
        <div className="triage-detail">
          <h3>Priority</h3>
          {thread.priorityReasons?.length ? (
            <ul>
              {thread.priorityReasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{readable(reason)}</li>
              ))}
            </ul>
          ) : (
            <p>No priority factors are available for this conversation.</p>
          )}
          {thread.priorityFlag && <p>Flag: {readable(thread.priorityFlag)}</p>}
          <p>
            Priority ranks attention using visible factors. It is a prototype
            score, separate from time urgency and recommendation risk.
          </p>
          {sample && <p>Fixed illustrative priority; no ranking model was run.</p>}
        </div>
        <div className="triage-detail">
          <h3>Time urgency</h3>
          {thread.urgencyReasons.length ? (
            <ul>
              {thread.urgencyReasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{readable(reason)}</li>
              ))}
            </ul>
          ) : (
            <p>No timing factors were returned.</p>
          )}
        </div>
        <div className="triage-detail">
          <h3>Sentiment</h3>
          {sentiment ? (
            <>
              <p>
                Route: {languageLabels[sentiment.language]} · Source:{" "}
                {sentimentSources[sentiment.source]}
              </p>
              {sentiment.modelId && <p>Model: {sentiment.modelId}</p>}
              <p>
                {hasConfidence
                  ? `${Math.round(confidence * 100)}% sentiment ${sentiment.source === "vietnamese_rules" ? "rule confidence (uncalibrated)" : "model confidence"}.`
                  : "Sentiment confidence unavailable."}{" "}
                {sentiment.source === "vietnamese_rules"
                  ? "Vietnamese rule labels have no calibrated probability of correctness."
                  : sentiment.source === "local_english_model"
                    ? "The English model score does not establish accuracy on these buyer messages."
                    : "No trained sentiment result is available."}
              </p>
              {sentiment.notice && <p>{sentiment.notice}</p>}
            </>
          ) : (
            <p>Sentiment was not analyzed for this conversation.</p>
          )}
          <p>Sentiment confidence is separate from recommendation confidence.</p>
          {sample && <p>Sample preview only. No sentiment model was run.</p>}
        </div>
      </details>
    </section>
  );
}
