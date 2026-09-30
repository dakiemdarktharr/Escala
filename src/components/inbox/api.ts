import type {
  ApiErrorResponse,
  AutonomyResponse,
  AutonomyUpdateInput,
  ConversationUpdateInput,
  CreateRecommendationResponse,
  InboxResponse,
  SellerDecisionInput,
  SellerDecisionResponse,
  SendReplyInput,
  SendReplyResponse,
  ThreadDetailResponse,
} from "@/domain/contracts";

export interface InboxClient {
  autonomy(signal?: AbortSignal): Promise<AutonomyResponse>;
  updateAutonomy(input: AutonomyUpdateInput): Promise<AutonomyResponse>;
  updateConversation(id: string, input: ConversationUpdateInput): Promise<ThreadDetailResponse>;
  retryReply(id: string, attemptId: string): Promise<SendReplyResponse>;
  inbox(signal?: AbortSignal): Promise<InboxResponse>;
  thread(id: string, signal?: AbortSignal): Promise<ThreadDetailResponse>;
  recommend(id: string): Promise<CreateRecommendationResponse>;
  reply(id: string, input: SendReplyInput): Promise<SendReplyResponse>;
  decide(
    id: string,
    input: SellerDecisionInput,
  ): Promise<SellerDecisionResponse>;
}

export class RequestError extends Error {
  constructor(
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
    this.name = "RequestError";
  }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options?.method === "POST" ? 120_000 : 20_000,
  );
  const abort = () => controller.abort();
  options?.signal?.addEventListener("abort", abort, { once: true });
  if (options?.signal?.aborted) controller.abort();
  try {
    const response = await fetch(url, {
      ...options,
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(options?.body ? { "Content-Type": "application/json" } : {}),
        ...options?.headers,
      },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body as ApiErrorResponse | null;
      throw new RequestError(
        error?.error?.message ||
          (response.status === 404
            ? "This part of the workspace isn’t available yet."
            : "The workspace couldn’t complete this request. Please try again."),
        error?.error?.code || `HTTP_${response.status}`,
      );
    }
    if (!body)
      throw new RequestError(
        "The workspace returned an unreadable response. Please try again.",
      );
    return body as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    if (options?.signal?.aborted)
      throw new DOMException("Aborted", "AbortError");
    throw new RequestError(
      controller.signal.aborted
        ? "This request is taking longer than expected. Refresh the conversation before retrying to check whether it was saved."
        : "Can’t reach the workspace. Check your connection and try again.",
      controller.signal.aborted ? "TIMEOUT" : "OFFLINE",
    );
  } finally {
    clearTimeout(timeout);
    options?.signal?.removeEventListener("abort", abort);
  }
}

export const apiClient: InboxClient = {
  autonomy: (signal) => request<AutonomyResponse>("/api/autonomy", { signal }),
  updateAutonomy: (input) => request<AutonomyResponse>("/api/autonomy", { method: "POST", body: JSON.stringify(input) }),
  updateConversation: (id, input) => request<ThreadDetailResponse>(`/api/threads/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(input) }),
  retryReply: (id, retryAttemptId) => request<SendReplyResponse>(`/api/threads/${encodeURIComponent(id)}/replies`, { method: "POST", body: JSON.stringify({ retryAttemptId }) }),
  inbox: (signal) => request<InboxResponse>("/api/inbox", { signal }),
  thread: (id, signal) =>
    request<ThreadDetailResponse>(`/api/threads/${encodeURIComponent(id)}`, {
      signal,
    }),
  recommend: (id) =>
    request<CreateRecommendationResponse>(
      `/api/threads/${encodeURIComponent(id)}/recommendations`,
      { method: "POST" },
    ),
  decide: (id, input) =>
    request<SellerDecisionResponse>(
      `/api/recommendations/${encodeURIComponent(id)}/decision`,
      { method: "POST", body: JSON.stringify(input) },
    ),
  reply: (id, input) =>
    request<SendReplyResponse>(
      `/api/threads/${encodeURIComponent(id)}/replies`,
      { method: "POST", body: JSON.stringify(input) },
    ),
};

export function errorMessage(error: unknown) {
  const labels: Record<string, string> = {
    INVALID_JSON: "Dữ liệu yêu cầu không hợp lệ. Hãy làm mới rồi thử lại.",
    INVALID_REPLY: "Nội dung hoặc thông tin gửi chưa hợp lệ. Kiểm tra bản nháp và tải lại hội thoại.",
    INVALID_CORRECTION: "Câu đính chính phải tham chiếu một câu trả lời tự động trong hội thoại này.",
    INVALID_RETRY: "Chưa xác định được lần gửi cần thử lại. Hãy làm mới hội thoại.",
    DELIVERY_NOT_FOUND: "Không tìm thấy lần gửi. Hãy tải lại hội thoại để kiểm tra.",
    USE_REPLY_WORKFLOW: "Dùng ô trả lời trong hội thoại để gửi mô phỏng hoặc chỉnh sửa nội dung.",
    INVALID_DECISION: "Quyết định chưa hợp lệ. Hãy kiểm tra đề xuất và chọn lại thao tác.",
    INVALID_SETTINGS: "Cài đặt chưa hợp lệ hoặc đã cũ. Hãy làm mới trước khi cập nhật.",
    INVALID_VISIT: "Mốc hoạt động chưa hợp lệ. Hãy tải lại bản tóm tắt.",
    INVALID_INBOUND: "Tin nhắn đầu vào chưa hợp lệ. Kiểm tra nội dung và thử lại.",
    INBOUND_CONFLICT: "Mã tin nhắn này đã được dùng cho nội dung khác. Hãy tải lại để kiểm tra.",
    INBOUND_FAILED: "Chưa ghi nhận được tin nhắn. Hãy làm mới để kiểm tra trước khi thử lại.",
    INVALID_STATE: "Trạng thái hoặc phiên bản hội thoại chưa hợp lệ. Hãy tải lại hội thoại.",
    WORKSPACE_UNAVAILABLE: "Không gian làm việc tạm thời chưa khả dụng. Hãy thử lại.",
    PROCESSING_FAILED: "Chưa xử lý được tin nhắn. Hãy kiểm tra hội thoại hoặc tự soạn trả lời.",
    DATABASE_UNAVAILABLE: "Dữ liệu hộp thư tạm thời chưa truy cập được. Hãy thử lại.",
    THREAD_NOT_FOUND: "Không tìm thấy hội thoại. Hãy làm mới hộp thư.",
    RECOMMENDATION_NOT_FOUND: "Không tìm thấy đề xuất. Hãy tải lại hội thoại.",
    STALE_CONTEXT: "Ngữ cảnh đã thay đổi. Kiểm tra tin nhắn mới nhất trước khi dùng bản nháp.",
    STALE_RECOMMENDATION: "Đề xuất đã thay đổi hoặc đã xử lý. Hãy tải lại hội thoại.",
    APPROVAL_REQUIRED: "Cần phê duyệt đúng nội dung cuối và ngữ cảnh hiện tại.",
    AUTONOMY_DISABLED: "Chế độ tự động đang dừng hoặc cài đặt đã thay đổi. Hãy tải lại.",
    AUTO_SEND_BLOCKED: "Câu trả lời chưa được phép gửi tự động. Hãy kiểm tra đề xuất.",
    SEND_FAILED: "Gửi mô phỏng chưa thành công. Nội dung vẫn được giữ để thử lại.",
    REPLY_CONFLICT: "Câu trả lời đang xử lý hoặc đề xuất đã được xử lý. Làm mới trước khi thử lại.",
    REQUEST_CONFLICT: "Yêu cầu đã được dùng cho nội dung khác. Làm mới và kiểm tra trước khi thử lại.",
    DECISION_CONFLICT: "Đề xuất không còn chờ xử lý. Hãy tải lại hội thoại.",
    SETTINGS_CONFLICT: "Chế độ xử lý đã thay đổi. Tải lại trước khi cập nhật.",
    SETTINGS_UNAVAILABLE: "Chưa tải được cài đặt xử lý. Hãy thử lại.",
    TIMEOUT: "Yêu cầu đang mất nhiều thời gian. Làm mới để kiểm tra đã lưu hay chưa trước khi thử lại.",
    OFFLINE: "Chưa kết nối được không gian làm việc. Kiểm tra mạng và thử lại.",
  };
  if (error instanceof RequestError) {
    // Keep the original diagnostic on RequestError; the seller sees an actionable localized notice.
    return labels[error.code] ?? "Chưa hoàn tất được yêu cầu. Hãy làm mới để kiểm tra trạng thái trước khi thử lại.";
  }
  return "Chưa tải được dữ liệu. Vui lòng thử lại.";
}
