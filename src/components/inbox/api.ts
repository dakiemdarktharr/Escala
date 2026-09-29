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
  return error instanceof RequestError
    ? error.message
    : "Something didn’t load correctly. Please try again.";
}
