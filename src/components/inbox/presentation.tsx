import type {
  InboxThreadSummary,
  RecommendationAction,
  RiskLevel,
  SentimentAnalysis,
} from "@/domain/contracts";
import { Icon, type IconName } from "@/components/ui/icon";

export const actionLabels: Record<RecommendationAction, string> = {
  AUTO_REPLY: "Trả lời thường gặp",
  DRAFT_FOR_SELLER: "Người bán kiểm tra",
  ASK_CLARIFICATION: "Hỏi thêm thông tin",
  ESCALATE: "Chuyển người phụ trách",
};

export const conversationLabels = {
  AWAITING_PROCESSING: "Chờ Escala xử lý",
  AUTO_HANDLED: "Đã tự trả lời mô phỏng",
  WAITING_FOR_BUYER: "Chờ khách phản hồi",
  WAITING_FOR_SELLER_REVIEW: "Cần bạn kiểm tra",
  APPROVAL_REQUIRED: "Cần phê duyệt",
  RESOLVED: "Đã kết thúc",
  ESCALATED: "Đã chuyển người phụ trách",
  SEND_FAILED: "Gửi mô phỏng thất bại",
};
export function conversationLabel(thread: InboxThreadSummary) {
  return thread.conversationState ? conversationLabels[thread.conversationState] : "Cần trả lời";
}
export function requestLabel(intent: string) {
  const labels: Record<string, string> = {
    refund: "Hoàn tiền", payment_dispute_and_refund: "Vấn đề thanh toán", cancellation: "Hủy đơn",
    wrong_item: "Giao sai hàng", damaged_item: "Hàng bị hỏng", order_status: "Tình trạng đơn",
    delivery_complaint: "Vấn đề giao hàng", return_or_exchange: "Đổi trả",
    positive_feedback: "Phản hồi", product_information: "Hỏi về sản phẩm", stock_check: "Tình trạng hàng",
    product_and_shipping_faq: "Sản phẩm và giao hàng", unknown: "Yêu cầu của khách",
  };
  return labels[intent] ?? "Yêu cầu của khách";
}
export function requestSummary(intent: string) {
  const summaries: Record<string, string> = {
    refund: "Khách đang hỏi về việc hoàn tiền.",
    payment_dispute_and_refund: "Khách cần hỗ trợ vấn đề thanh toán.",
    cancellation: "Khách muốn hủy đơn hàng.",
    wrong_item: "Khách cho biết đã nhận sai sản phẩm.",
    damaged_item: "Khách cho biết sản phẩm nhận được bị hỏng.",
    order_status: "Khách muốn biết tình trạng đơn hàng.",
    delivery_complaint: "Khách cần hỗ trợ về giao hàng.",
    return_or_exchange: "Khách đang hỏi về đổi trả.",
    positive_feedback: "Khách đã chia sẻ phản hồi về sản phẩm.",
    product_information: "Khách có câu hỏi về sản phẩm.",
    stock_check: "Khách muốn kiểm tra tình trạng hàng.",
    product_and_shipping_faq: "Khách đang hỏi về sản phẩm và thông tin giao hàng.",
  };
  return summaries[intent] ?? "Đọc tin nhắn của khách trước khi trả lời.";
}
export function needsSeller(thread: InboxThreadSummary) {
  return thread.conversationState
    ? ["AWAITING_PROCESSING", "WAITING_FOR_SELLER_REVIEW", "APPROVAL_REQUIRED", "ESCALATED", "SEND_FAILED"].includes(thread.conversationState)
    : thread.requiresAction === true;
}
export function autoHandled(thread: InboxThreadSummary) {
  return ["AUTO_HANDLED", "WAITING_FOR_BUYER", "RESOLVED"].includes(thread.conversationState ?? "");
}

const displayLabels: Record<string, string> = {
  "Ask buyer for order and item details": "Hỏi khách mã đơn và thông tin sản phẩm",
  "No explicit temporal deadline": "Chưa có hạn thời gian cụ thể",
  "answer would be unreliable without evidence": "Chưa đủ nguồn để trả lời đáng tin cậy",
  "customer mentions cancellation": "Khách đề cập hủy đơn",
  "customer waiting for resolution": "Khách đang chờ giải quyết",
  "delivery deadline within 24 hours": "Khách nêu hạn giao trong 24 giờ",
  "no deadline or financial impact": "Chưa có hạn chót hoặc tác động tài chính",
  "order and product details are missing": "Thiếu thông tin đơn hàng và sản phẩm",
  "order status mutation": "Có yêu cầu đổi trạng thái đơn hàng",
  "payment or financial impact": "Có tác động tới thanh toán hoặc tài chính",
  "product compatibility is not documented": "Chưa có tài liệu về khả năng tương thích",
  "public complaint threat": "Khách đề cập khiếu nại công khai",
  "refund request": "Yêu cầu hoàn tiền",
  "reputational damage risk": "Rủi ro ảnh hưởng uy tín",
  "return window may be time-sensitive": "Cần kiểm tra hạn đổi trả",
  "routine product question": "Câu hỏi thường gặp về sản phẩm",
  "routine-looking question, but interpretation is unavailable": "Câu hỏi có vẻ thông thường nhưng chưa phân tích được yêu cầu",
  "unauthorized delivery guarantee could cause irreversible loss": "Cam kết giao hàng chưa được duyệt có thể gây thiệt hại",
  "Payment status must be verified by a seller or payment operator; no refund promise is generated.": "Người bán hoặc bên thanh toán cần xác minh giao dịch; chưa đưa ra cam kết hoàn tiền.",
  "A seller must verify the carrier status and approved delivery commitment before replying.": "Người bán cần xác minh tình trạng vận chuyển và cam kết giao hàng đã duyệt trước khi trả lời.",
  "Cancellation and complaint handling require seller review; no order mutation is performed.": "Yêu cầu hủy đơn và khiếu nại cần người bán kiểm tra; chưa thay đổi đơn hàng.",
  "No verified compatibility evidence was retrieved; seller review is required and no product claim is generated.": "Chưa có nguồn xác minh khả năng tương thích; cần người bán kiểm tra và chưa khẳng định thông tin sản phẩm.",
  "The model was unavailable; no answer was generated. Please review manually.": "Mô hình chưa khả dụng, chưa tạo được câu trả lời. Vui lòng tự kiểm tra.",
  "Seller declined the suggestion; manual reply remains available.": "Bạn đã bỏ đề xuất; vẫn có thể tự soạn câu trả lời.",
  "Synthetic inbound event persisted; prior draft approvals invalidated": "Tin nhắn mẫu đã được lưu; các phê duyệt bản nháp trước đó không còn hiệu lực.",
  "Seller changed conversation state; no order state was changed": "Bạn đã đổi trạng thái hội thoại; trạng thái đơn hàng không thay đổi.",
  "Draft only mode: no automatic sending": "Chế độ chỉ soạn bản nháp: Escala không tự gửi tin.",
  "Automatic processing could not complete; seller review required": "Escala chưa xử lý xong; bạn cần kiểm tra hội thoại.",
  "Automatic processing failed closed; no automatic reply recorded": "Escala không thể xử lý an toàn nên không ghi nhận câu trả lời tự động.",
  "Simulated delivery; no marketplace message or order mutation": "Đã mô phỏng gửi; không có tin nhắn nào được gửi lên sàn và đơn hàng không thay đổi.",
  "Simulated delivery failed; no buyer reply recorded": "Gửi mô phỏng thất bại; khách chưa nhận được câu trả lời.",
  "Simulated delivery failed; retry available": "Gửi mô phỏng thất bại; bạn có thể thử lại.",

  "financial impact requires seller review": "Vấn đề tài chính cần người bán kiểm tra",
  "order changes are not performed by Escala": "Escala không tự thay đổi đơn hàng",
  "delivery commitments need verified carrier information": "Cam kết giao hàng cần thông tin xác thực từ đơn vị vận chuyển",
  "complaint or reputation risk requires seller review": "Khiếu nại hoặc rủi ro uy tín cần người bán kiểm tra",
  "safety or health concerns require seller review": "Vấn đề an toàn hoặc sức khỏe cần người bán kiểm tra",
  "account, identity, or security issues require seller review": "Vấn đề tài khoản, danh tính hoặc bảo mật cần người bán kiểm tra",
  "exceptional discounts or compensation require seller review": "Giảm giá ngoại lệ hoặc bồi thường cần người bán kiểm tra",
  "requested external actions need seller approval": "Yêu cầu thao tác bên ngoài cần người bán phê duyệt",
  "replacement or reshipment requires seller approval": "Thay thế hoặc gửi lại hàng cần người bán phê duyệt",
  "returns or exchanges need seller authorization": "Đổi trả cần người bán cho phép",
  "fraud, disputes and policy exceptions require seller review": "Gian lận, tranh chấp hoặc ngoại lệ chính sách cần người bán kiểm tra",
  "fixture is classified for human review": "Tình huống mẫu được phân loại để người bán kiểm tra",
  "Generated reply introduces an unverified commitment or completed action": "Bản nháp có cam kết hoặc khẳng định hoàn tất hành động chưa được xác minh",
  "Hostile or escalated wording needs seller judgment before an automated response": "Lời lẽ gay gắt cần người bán cân nhắc trước khi trả lời tự động",
  "Uncertain or conflicting analysis/context requires seller review": "Phân tích hoặc ngữ cảnh chưa chắc chắn, mâu thuẫn cần người bán kiểm tra",
  "Reply confidence is unavailable or below the automatic-send threshold": "Độ tin cậy chưa có hoặc thấp hơn ngưỡng gửi tự động",
  "Draft is not a verified automatic reply; seller review required": "Bản nháp chưa đủ điều kiện xác thực để gửi tự động; cần người bán kiểm tra",
  "Review refund request": "Kiểm tra yêu cầu hoàn tiền",
  "Review payment discrepancy": "Kiểm tra chênh lệch thanh toán",
  "Review cancellation request": "Kiểm tra yêu cầu hủy đơn",
  "Ask for order number and a photo": "Hỏi mã đơn và ảnh sản phẩm",
  "Ask for a photo and order number": "Hỏi ảnh sản phẩm và mã đơn",
  "Ask buyer for order number": "Hỏi khách mã đơn",
  "Check shipment information": "Kiểm tra thông tin vận chuyển",
  "Check exchange details": "Kiểm tra thông tin đổi hàng",
  "Thank the buyer": "Cảm ơn khách hàng",
  "Confirm product details": "Xác nhận thông tin sản phẩm",
  "Check available options": "Kiểm tra lựa chọn còn hàng",
  "Reply with product and delivery information": "Trả lời thông tin sản phẩm và giao hàng",
  "Review uncertain intent": "Làm rõ yêu cầu của khách",
  "Review duplicate payment request": "Kiểm tra yêu cầu về thanh toán trùng",
  "Review delivery deadline": "Kiểm tra hạn giao hàng",
  "Ask for product details": "Hỏi thông tin sản phẩm",
  "Check product care information": "Kiểm tra hướng dẫn bảo quản sản phẩm",
  "Ask for missing details": "Hỏi thông tin còn thiếu",
  "Explicit time pressure or deadline in the message": "Tin nhắn nêu rõ hạn hoặc yêu cầu gấp",
  "Buyer requests a response soon": "Khách muốn được phản hồi sớm",
  "No explicit temporal deadline detected": "Chưa nhận thấy hạn thời gian cụ thể",
  "Needs seller action": "Cần người bán xử lý",
  "No seller action needed": "Chưa cần người bán xử lý",
  "Negative sentiment": "Sắc thái tiêu cực",
  "Abusive language needs careful handling": "Ngôn ngữ xúc phạm cần xử lý thận trọng",
  "Direct payment demand": "Yêu cầu thanh toán trực tiếp",
  "Waiting over 24 hours": "Đã chờ hơn 24 giờ",
  "Waiting over 4 hours": "Đã chờ hơn 4 giờ",
  "abusive_language": "Ngôn ngữ xúc phạm",
  "direct_money_demand": "Yêu cầu tiền trực tiếp",
  "Trusted context is stale, incomplete, or does not answer this message; seller must verify it": "Ngữ cảnh đã cũ, thiếu hoặc không trả lời được tin nhắn; người bán cần xác minh",
  "Candidate intent conflicts with deterministic buyer intent": "Yêu cầu trong bản nháp mâu thuẫn với phân loại theo quy tắc",
  "Candidate cites evidence outside the retrieved set; seller must verify it": "Bản nháp trích dẫn nguồn ngoài tập truy xuất; người bán cần xác minh",
  "Missing information requires seller review": "Thiếu thông tin, cần người bán kiểm tra",
  "Model failure or prohibited completed-action claim; candidate was not saved": "Mô hình lỗi hoặc khẳng định hành động đã hoàn tất không hợp lệ; không lưu bản nháp đó",
  "ESCALA_CONFIDENCE_THRESHOLD must be between 0.90 and 1.00; automation disabled": "Ngưỡng tin cậy không hợp lệ; đã tắt tự động",
  "Generated proposal introduced an unsupported commitment; safe fallback held for seller approval": "Đề xuất có cam kết thiếu căn cứ; dùng mẫu dự phòng và chờ người bán duyệt",
  "Escala replied via simulated delivery; waiting for buyer": "Escala đã gửi trả lời mô phỏng; chờ khách",
  "Seller replied; waiting for buyer": "Người bán đã trả lời mô phỏng; chờ khách",
  "Reply was not delivered. Review the failure and retry the same delivery.": "Chưa gửi được. Kiểm tra lỗi và thử lại cùng lần gửi.",
  "New buyer message queued for Escala processing": "Tin nhắn mới đang chờ Escala xử lý",
  "Conversation state explicitly set by seller": "Người bán đã chủ động đổi trạng thái hội thoại",
  "Sample state only; resets on reload.": "Trạng thái xem thử; tải lại sẽ mất.",
  "Sample reply only. Resets on reload.": "Câu trả lời xem thử; tải lại sẽ mất.",
  "Sample preview does not run sentiment analysis.": "Bản xem thử không chạy phân tích sắc thái.",
  "This is a fixed sample template. No model was called; confidence is unavailable.": "Đây là mẫu minh họa cố định. Chưa gọi mô hình, chưa có độ tin cậy.",
  "Live OpenAI drafting unavailable: OPENAI_API_KEY is missing. Showing a reviewed template with no model confidence.": "Chưa cấu hình khóa OpenAI. Đang hiển thị mẫu đã duyệt, không có độ tin cậy từ mô hình.",
  "This synthetic scenario simulates a model failure. Showing a reviewed template, not model output.": "Tình huống giả lập mô hình lỗi. Đang dùng mẫu đã duyệt, không phải kết quả mô hình.",
  "Live drafting failed or produced an invalid/unsafe candidate. Showing a reviewed template with no model confidence.": "Tạo nháp lỗi hoặc nội dung không hợp lệ. Đang dùng mẫu đã duyệt, không có độ tin cậy mô hình.",
  "Historical recommendation predates the reply workflow. Generate again for a current suggestion; its audit is retained.": "Đề xuất cũ có trước luồng trả lời hiện tại. Tạo lại đề xuất; nhật ký cũ vẫn được giữ.",
  "Awaiting background language and sentiment analysis": "Chờ phân tích ngôn ngữ và sắc thái nền",
  "Rule signals have no calibrated confidence; Vietnamese sentiment is not a trained model.": "Quy tắc tiếng Việt chưa có độ tin cậy hiệu chỉnh; không phải mô hình được huấn luyện.",
  "Local English sentiment checkpoint unavailable; seller review required.": "Chưa tải được mô hình sắc thái tiếng Anh cục bộ; cần người bán kiểm tra.",
  "reply_sent": "Đã gửi mô phỏng câu trả lời",
  "conversation_state": "Đổi trạng thái hội thoại",
  "recommendation": "Chuẩn bị đề xuất",
  "seller_decision": "Quyết định người bán",
  "automatic_reply": "Trả lời tự động mô phỏng",

  ...conversationLabels,
  AUTO_SEND: "Đủ điều kiện tự động", MANUAL_ONLY: "Tự soạn trả lời",
  REVIEW_REQUIRED: "Cần kiểm tra", APPROVAL_REQUIRED: "Cần phê duyệt",
  QUEUED: "Đang chờ", SENDING: "Đang gửi mô phỏng", SENT: "Đã gửi mô phỏng", FAILED: "Gửi mô phỏng thất bại",
  seller_policy: "Chính sách người bán", product_faq: "Hỏi đáp sản phẩm", order_context: "Thông tin đơn hàng",
  positive: "Tích cực", neutral: "Trung tính", negative: "Tiêu cực", unknown: "Chưa xác định",
  low: "Thấp", medium: "Vừa", high: "Cao", seller: "Người bán", automatic: "Tự động",
  manual: "Tự soạn", suggested: "Theo đề xuất", edited: "Đã chỉnh sửa", approve: "Phê duyệt",
  decline: "Bỏ đề xuất", escalate: "Chuyển người phụ trách", ask_clarification: "Hỏi thêm thông tin",
  openai: "OpenAI", template: "Mẫu đã duyệt", test_stub: "Dữ liệu kiểm thử cục bộ",
  refund: "Hoàn tiền", cancellation: "Hủy đơn", stock_check: "Kiểm tra hàng",
  order_status: "Tình trạng đơn", payment_dispute_and_refund: "Thanh toán và hoàn tiền",
  wrong_item: "Giao sai hàng", damaged_item: "Hàng bị hỏng", delivery_complaint: "Vấn đề giao hàng",
  return_or_exchange: "Đổi trả", positive_feedback: "Phản hồi tích cực",
  product_information: "Thông tin sản phẩm", product_and_shipping_faq: "Hỏi đáp sản phẩm và giao hàng",
};

export function readable(value: string) {
  if (value.startsWith("Intent: ")) return `Yêu cầu: ${requestLabel(value.slice(8).replaceAll(" ", "_"))}`;
  if (displayLabels[value] || displayLabels[value.toLowerCase()]) return displayLabels[value] ?? displayLabels[value.toLowerCase()];
  if (!value.includes("_") && !/^[A-Z\d :]+$/.test(value)) return value;
  const text = value.replaceAll("_", " ").replaceAll(":", ": ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function dateLabel(value: string, includeDate = false) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có thời gian";
  return new Intl.DateTimeFormat("vi-VN", {
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
      {kind === "risk" ? "Rủi ro" : "Khẩn cấp"}: {readable(level)}
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
      <span className="sr-only">Đang tải hội thoại…</span>
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
  local_english_model: "Mô hình tiếng Anh cục bộ",
  vietnamese_rules: "Quy tắc tiếng Việt",
  unavailable: "Chưa có",
};
const languageLabels: Record<SentimentAnalysis["language"], string> = {
  unknown: "Chờ phân tích",
  english: "Tiếng Anh",
  vietnamese: "Tiếng Việt",
  mixed: "Nhiều ngôn ngữ",
};

export function PriorityBadge({ score }: { score?: number }) {
  return (
    <span className="badge priority-score">
      Ưu tiên{" "}
      {score !== undefined && Number.isFinite(score) ? score : "chưa có"}
    </span>
  );
}

export function SentimentBadge({ sentiment }: { sentiment: SentimentAnalysis }) {
  return (
    <span className={`badge sentiment-${sentiment.label}`}>
      {sentiment.label === "unknown"
        ? "Chưa rõ sắc thái"
        : `Sắc thái: ${readable(sentiment.label)}`}
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
    <section className="triage-signals" aria-label="Tín hiệu phân loại hội thoại">
      <div className="triage-summary">
        <PriorityBadge score={thread.priorityScore} />
        <LevelBadge level={thread.urgency} kind="urgency" />
        {sentiment && <SentimentBadge sentiment={sentiment} />}
        {thread.requiresAction !== undefined && (
          <span className="badge action-needed">
            {thread.requiresAction ? "Cần xử lý" : "Chưa có yêu cầu xử lý"}
          </span>
        )}
      </div>
      <details className="priority-details">
        <summary>Chi tiết</summary>
        <div className="triage-detail">
          <h3>Ưu tiên</h3>
          {thread.priorityReasons?.length ? (
            <ul>
              {thread.priorityReasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{readable(reason)}</li>
              ))}
            </ul>
          ) : (
            <p>Chưa có yếu tố ưu tiên cho hội thoại này.</p>
          )}
          {thread.priorityFlag && <p>Cờ: {readable(thread.priorityFlag)}</p>}
          <p>
            Điểm ưu tiên giúp sắp xếp thứ tự xử lý theo các yếu tố hiển thị. Đây là điểm thử nghiệm, độc lập với mức khẩn cấp và rủi ro trả lời.
          </p>
          {sample && <p>Điểm ưu tiên minh họa; chưa chạy mô hình xếp hạng.</p>}
        </div>
        <div className="triage-detail">
          <h3>Mức khẩn cấp theo thời gian</h3>
          {thread.urgencyReasons.length ? (
            <ul>
              {thread.urgencyReasons.map((reason, index) => (
                <li key={`${reason}-${index}`}>{readable(reason)}</li>
              ))}
            </ul>
          ) : (
            <p>Chưa có yếu tố thời gian.</p>
          )}
        </div>
        <div className="triage-detail">
          <h3>Sắc thái</h3>
          {sentiment ? (
            <>
              <p>
                Ngôn ngữ: {languageLabels[sentiment.language]} · Nguồn:{" "}
                {sentimentSources[sentiment.source]}
              </p>
              {sentiment.modelId && <p>Mô hình: {sentiment.modelId}</p>}
              <p>
                {hasConfidence
                  ? `${Math.round(confidence * 100)}% độ tin cậy sắc thái (${sentiment.source === "vietnamese_rules" ? "quy tắc, chưa hiệu chỉnh" : "điểm mô hình"}).`
                  : "Chưa có độ tin cậy về sắc thái."}{" "}
                {sentiment.source === "vietnamese_rules"
                  ? "Nhãn theo quy tắc tiếng Việt chưa có xác suất đúng được hiệu chỉnh."
                  : sentiment.source === "local_english_model"
                    ? "Điểm mô hình tiếng Anh chưa chứng minh độ chính xác trên các tin nhắn này."
                    : "Chưa có kết quả từ mô hình phân tích sắc thái."}
              </p>
              {sentiment.notice && <p>{readable(sentiment.notice)}</p>}
            </>
          ) : (
            <p>Chưa phân tích sắc thái hội thoại này.</p>
          )}
          <p>Độ tin cậy về sắc thái độc lập với độ tin cậy của đề xuất.</p>
          {sample && <p>Bản xem thử; chưa chạy mô hình phân tích sắc thái.</p>}
        </div>
      </details>
    </section>
  );
}
